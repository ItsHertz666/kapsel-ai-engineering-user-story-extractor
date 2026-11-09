import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../src/db';
import {
	transcripts,
	userStories,
	acceptanceCriteria,
	extractionRuns,
	extractionAttempts,
	users
} from '../src/db/schema';
import { handleRequest } from '../src/index';
import {
	calculateAttemptCost,
	getModelPricingTier,
	KNOWN_MODEL_PRICING
} from '../src/utils/pricing';
import { recoverStaleRuns, processTranscript } from '../src/services/extractor';
import { eq, and, desc } from 'drizzle-orm';

describe('Token Usage Tracking & Extraction Runs Architecture', () => {
	let testTranscriptId: number;
	let testUserId: string;

	beforeAll(async () => {
		const [u] = await db
			.insert(users)
			.values({
				email: 'token_usage_test_user@example.com',
				passwordHash: 'hash',
				role: 'user',
				isActive: true
			})
			.returning({ id: users.id });
		testUserId = u.id;

		const [t] = await db
			.insert(transcripts)
			.values({
				userId: testUserId,
				rawText: 'Rapat sistem absensi karyawan. Karyawan ingin scan QR untuk presensi harian.',
				originalFilename: 'test-token-usage.txt',
				status: 'queued'
			})
			.returning({ id: transcripts.id });
		testTranscriptId = t!.id;
	});

	afterAll(async () => {
		if (testTranscriptId) {
			await db.delete(transcripts).where(eq(transcripts.id, testTranscriptId));
		}
		if (testUserId) {
			await db.delete(users).where(eq(users.id, testUserId));
		}
	});

	describe('Model Pricing Utility (utils/pricing.ts)', () => {
		it('should identify verified pricing for known models', () => {
			const ossTier = getModelPricingTier('openai/gpt-oss-120b');
			expect(ossTier).not.toBeNull();
			expect(ossTier?.promptRatePerMillionUsd).toBe(0.03);
			expect(ossTier?.completionRatePerMillionUsd).toBe(0.15);
			expect(ossTier?.retrievedAt).toBe('2026-11-03');

			const ossFreeTier = getModelPricingTier('openai/gpt-oss-120b:free');
			expect(ossFreeTier).not.toBeNull();
			expect(ossFreeTier?.promptRatePerMillionUsd).toBe(0.0);
			expect(ossFreeTier?.completionRatePerMillionUsd).toBe(0.0);
			expect(ossFreeTier?.retrievedAt).toBe('2026-11-03');

			const miniTier = getModelPricingTier('openai/gpt-4o-mini');
			expect(miniTier).not.toBeNull();
			expect(miniTier?.promptRatePerMillionUsd).toBe(0.15);
			expect(miniTier?.completionRatePerMillionUsd).toBe(0.60);
			expect(miniTier?.retrievedAt).toBe('2026-11-03');
		});

		it('should return null for unknown models without substituting default pricing', () => {
			const unknownTier = getModelPricingTier('unregistered-custom-llm');
			expect(unknownTier).toBeNull();

			const cost = calculateAttemptCost('unregistered-custom-llm', 1000, 500);
			expect(cost.promptRatePerMillionUsd).toBeNull();
			expect(cost.completionRatePerMillionUsd).toBeNull();
			expect(cost.estimatedCostUsd).toBeNull();
		});

		it('should calculate cost accurately for valid tokens', () => {
			// 1,000,000 prompt tokens @ $0.03 + 1,000,000 completion tokens @ $0.15 = $0.18
			const cost = calculateAttemptCost('openai/gpt-oss-120b', 1_000_000, 1_000_000);
			expect(cost.estimatedCostUsd).toBe(0.18);
			expect(cost.promptRatePerMillionUsd).toBe(0.03);
			expect(cost.completionRatePerMillionUsd).toBe(0.15);
		});

		it('should return null estimated cost when tokens are missing (null)', () => {
			const cost = calculateAttemptCost('openai/gpt-oss-120b', null, null);
			expect(cost.promptRatePerMillionUsd).toBe(0.03);
			expect(cost.completionRatePerMillionUsd).toBe(0.15);
			expect(cost.estimatedCostUsd).toBeNull();
		});
	});

	describe('Database Schema & Relations for Extraction Runs & Attempts', () => {
		it('should record hierarchical extraction run and child attempt records', async () => {
			// 1. Create a simulated run #1
			const [run1] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 1,
					status: 'completed',
					startedAt: new Date(),
					completedAt: new Date()
				})
				.returning();

			expect(run1!.runNumber).toBe(1);
			expect(run1!.status).toBe('completed');

			// 2. Insert attempt 1: response_received -> parse_error
			const pricing1 = calculateAttemptCost('openai/gpt-oss-120b', 500, 200);
			const [attempt1] = await db
				.insert(extractionAttempts)
				.values({
					runId: run1!.id,
					attemptNumber: 1,
					modelName: 'openai/gpt-oss-120b',
					isFallback: false,
					httpStatusCode: 200,
					promptTokens: 500,
					completionTokens: 200,
					totalTokens: 700,
					durationMs: 1200,
					status: 'parse_error',
					promptRatePerMillionUsd: pricing1.promptRatePerMillionUsd,
					completionRatePerMillionUsd: pricing1.completionRatePerMillionUsd,
					estimatedCostUsd: pricing1.estimatedCostUsd,
					errorMessage: 'Unexpected token < in JSON at position 0'
				})
				.returning();

			expect(attempt1!.status).toBe('parse_error');
			expect(attempt1!.isFallback).toBe(false);
			expect(attempt1!.totalTokens).toBe(700);

			// 3. Insert attempt 2: success on retry
			const pricing2 = calculateAttemptCost('openai/gpt-oss-120b', 510, 250);
			const [attempt2] = await db
				.insert(extractionAttempts)
				.values({
					runId: run1!.id,
					attemptNumber: 2,
					modelName: 'openai/gpt-oss-120b',
					isFallback: false,
					httpStatusCode: 200,
					promptTokens: 510,
					completionTokens: 250,
					totalTokens: 760,
					durationMs: 1400,
					status: 'success',
					promptRatePerMillionUsd: pricing2.promptRatePerMillionUsd,
					completionRatePerMillionUsd: pricing2.completionRatePerMillionUsd,
					estimatedCostUsd: pricing2.estimatedCostUsd,
					errorMessage: null
				})
				.returning();

			expect(attempt2!.status).toBe('success');
			expect(attempt2!.attemptNumber).toBe(2);

			// 4. Verify cascade fetch through Drizzle relations via GET /api/transcripts/:id
			const req = new Request(`http://localhost:3000/api/transcripts/${testTranscriptId}`);
			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.id).toBe(testTranscriptId);
			expect(data.usage_summary).toBeDefined();

			// Latest run sums: (500 + 510 = 1010 prompt), (200 + 250 = 450 completion)
			expect(data.usage_summary.latest_run.run_id).toBe(run1!.id);
			expect(data.usage_summary.latest_run.prompt_tokens).toBe(1010);
			expect(data.usage_summary.latest_run.completion_tokens).toBe(450);
			expect(data.usage_summary.latest_run.total_tokens).toBe(1460);
			expect(data.usage_summary.latest_run.estimated_cost_usd).toBeGreaterThan(0);
		});

		it('should preserve historical runs on transcript reprocessing', async () => {
			// Simulate run #2 (Reprocessing of the same transcript)
			const [run2] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 2,
					status: 'completed',
					startedAt: new Date(),
					completedAt: new Date()
				})
				.returning();

			// Insert attempt in run #2 using fallback model
			const fallbackPricing = calculateAttemptCost('openai/gpt-4o-mini', 600, 300);
			await db.insert(extractionAttempts).values({
				runId: run2!.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-4o-mini',
				isFallback: true,
				httpStatusCode: 200,
				promptTokens: 600,
				completionTokens: 300,
				totalTokens: 900,
				durationMs: 950,
				status: 'success',
				promptRatePerMillionUsd: fallbackPricing.promptRatePerMillionUsd,
				completionRatePerMillionUsd: fallbackPricing.completionRatePerMillionUsd,
				estimatedCostUsd: fallbackPricing.estimatedCostUsd,
				errorMessage: null
			});

			const req = new Request(`http://localhost:3000/api/transcripts/${testTranscriptId}`);
			const res = await handleRequest(req);
			const data = (await res.json()) as any;

			// Lifetime summary should include 2 runs
			expect(data.usage_summary.lifetime.total_runs).toBe(2);
			// Total lifetime tokens: 1460 (run 1) + 900 (run 2) = 2360
			expect(data.usage_summary.lifetime.total_tokens).toBe(2360);

			// Latest run should specifically reflect run #2
			expect(data.usage_summary.latest_run.run_number).toBe(2);
			expect(data.usage_summary.latest_run.total_tokens).toBe(900);
		});

		it('should enforce unique constraint on (transcript_id, run_number)', async () => {
			let errorThrown = false;
			try {
				await db.insert(extractionRuns).values({
					transcriptId: testTranscriptId,
					runNumber: 1,
					status: 'failed'
				});
			} catch (e) {
				errorThrown = true;
			}
			expect(errorThrown).toBe(true);
		});

		it('should enforce unique constraint on (run_id, attempt_number)', async () => {
			const [activeRun] = await db
				.select()
				.from(extractionRuns)
				.where(eq(extractionRuns.transcriptId, testTranscriptId))
				.limit(1);

			let errorThrown = false;
			try {
				await db.insert(extractionAttempts).values({
					runId: activeRun!.id,
					attemptNumber: 1,
					modelName: 'openai/gpt-oss-120b',
					isFallback: false,
					durationMs: 100,
					status: 'network_error',
					errorMessage: 'Collision test'
				});
			} catch (e) {
				errorThrown = true;
			}
			expect(errorThrown).toBe(true);
		});
	});

	describe('Granular Attempt Scenarios: HTTP Retries, Fallbacks, Missing Usage, & Network Errors', () => {
		it('should accurately record HTTP error retries (429/502/503)', async () => {
			const [testRun] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 10,
					status: 'completed'
				})
				.returning();

			// Attempt 1: 502 Bad Gateway
			await db.insert(extractionAttempts).values({
				runId: testRun!.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				httpStatusCode: 502,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				durationMs: 400,
				status: 'api_error',
				errorMessage: 'Status 502: Bad Gateway from provider'
			});

			// Attempt 2: 429 Rate Limited
			await db.insert(extractionAttempts).values({
				runId: testRun!.id,
				attemptNumber: 2,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				httpStatusCode: 429,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				durationMs: 300,
				status: 'api_error',
				errorMessage: 'Status 429: Rate limit reached'
			});

			// Attempt 3: Succeeded
			const p3 = calculateAttemptCost('openai/gpt-oss-120b', 800, 200);
			await db.insert(extractionAttempts).values({
				runId: testRun!.id,
				attemptNumber: 3,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				httpStatusCode: 200,
				promptTokens: 800,
				completionTokens: 200,
				totalTokens: 1000,
				durationMs: 1500,
				status: 'success',
				promptRatePerMillionUsd: p3.promptRatePerMillionUsd,
				completionRatePerMillionUsd: p3.completionRatePerMillionUsd,
				estimatedCostUsd: p3.estimatedCostUsd
			});

			const attempts = await db
				.select()
				.from(extractionAttempts)
				.where(eq(extractionAttempts.runId, testRun!.id));

			expect(attempts.length).toBe(3);
			expect(attempts[0]!.httpStatusCode).toBe(502);
			expect(attempts[0]!.status).toBe('api_error');
			expect(attempts[1]!.httpStatusCode).toBe(429);
			expect(attempts[2]!.status).toBe('success');
			expect(attempts[2]!.totalTokens).toBe(1000);
		});

		it('should record network_error when fetch throws before receiving HTTP response', async () => {
			const [testRun] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 11,
					status: 'failed'
				})
				.returning();

			await db.insert(extractionAttempts).values({
				runId: testRun!.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				httpStatusCode: null, // No HTTP status received
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				durationMs: 50,
				status: 'network_error',
				errorMessage: 'FetchError: connection refused or DNS failure'
			});

			const [att] = await db
				.select()
				.from(extractionAttempts)
				.where(eq(extractionAttempts.runId, testRun!.id));

			expect(att!.status).toBe('network_error');
			expect(att!.httpStatusCode).toBeNull();
			expect(att!.promptTokens).toBeNull();
			expect(att!.errorMessage).toContain('connection refused');
		});

		it('should handle missing usage metadata as NULL (not zero) and nullify cost calculation', async () => {
			const [testRun] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 12,
					status: 'completed'
				})
				.returning();

			const costNoUsage = calculateAttemptCost('openai/gpt-oss-120b', null, null);
			expect(costNoUsage.estimatedCostUsd).toBeNull();

			await db.insert(extractionAttempts).values({
				runId: testRun!.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				httpStatusCode: 200,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				durationMs: 800,
				status: 'success',
				promptRatePerMillionUsd: costNoUsage.promptRatePerMillionUsd,
				completionRatePerMillionUsd: costNoUsage.completionRatePerMillionUsd,
				estimatedCostUsd: costNoUsage.estimatedCostUsd
			});

			const [att] = await db
				.select()
				.from(extractionAttempts)
				.where(eq(extractionAttempts.runId, testRun!.id));

			expect(att!.promptTokens).toBeNull();
			expect(att!.totalTokens).toBeNull();
			expect(att!.estimatedCostUsd).toBeNull();
		});

		it('should preserve tokens and snapshots when parsing fails, recording parse_error', async () => {
			const [testRun] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 13,
					status: 'failed'
				})
				.returning();

			const costParseError = calculateAttemptCost('openai/gpt-oss-120b', 650, 350);

			await db.insert(extractionAttempts).values({
				runId: testRun!.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				httpStatusCode: 200,
				promptTokens: 650,
				completionTokens: 350,
				totalTokens: 1000,
				durationMs: 1100,
				status: 'parse_error',
				promptRatePerMillionUsd: costParseError.promptRatePerMillionUsd,
				completionRatePerMillionUsd: costParseError.completionRatePerMillionUsd,
				estimatedCostUsd: costParseError.estimatedCostUsd,
				errorMessage: 'JSON parse error: missing closing brace'
			});

			const [att] = await db
				.select()
				.from(extractionAttempts)
				.where(eq(extractionAttempts.runId, testRun!.id));

			expect(att!.status).toBe('parse_error');
			expect(att!.totalTokens).toBe(1000);
			expect(att!.estimatedCostUsd).toBeGreaterThan(0);
			expect(att!.errorMessage).toContain('missing closing brace');
		});
	});

	describe('Concurrency Protection & Lock Verification', () => {
		it('should prevent concurrent processing requests on a transcript in processing state', async () => {
			// Set transcript in 'processing' status with an active run
			const [activeRun] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 20,
					status: 'processing'
				})
				.returning();

			// Calling processTranscript should detect active run and reject with HTTP 409
			let errorObj: any = null;
			try {
				await processTranscript(testTranscriptId);
			} catch (err: any) {
				errorObj = err;
			}

			expect(errorObj).not.toBeNull();
			expect(errorObj.statusCode).toBe(409);
			expect(errorObj.message).toContain('currently being processed');

			// Cleanup the simulated processing run
			await db.delete(extractionRuns).where(eq(extractionRuns.id, activeRun!.id));
		});
	});

	describe('Stale Run Recovery Strategy (recoverStaleRuns)', () => {
		it('should mark runs older than threshold as failed without deleting attempts', async () => {
			// Create a run started 15 minutes ago in 'processing' state
			const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
			const [staleRun] = await db
				.insert(extractionRuns)
				.values({
					transcriptId: testTranscriptId,
					runNumber: 99,
					status: 'processing',
					startedAt: fifteenMinsAgo
				})
				.returning();

			// Add an attempt to the stale run
			await db.insert(extractionAttempts).values({
				runId: staleRun!.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-oss-120b',
				isFallback: false,
				durationMs: 3000,
				status: 'response_received',
				promptTokens: 400,
				completionTokens: 100,
				totalTokens: 500,
				errorMessage: null
			});

			// Trigger recovery with a 10-minute threshold
			const recoveredCount = await recoverStaleRuns(10 * 60 * 1000);
			expect(recoveredCount).toBeGreaterThanOrEqual(1);

			// Verify run is marked failed
			const [recoveredRun] = await db
				.select()
				.from(extractionRuns)
				.where(eq(extractionRuns.id, staleRun!.id));
			expect(recoveredRun!.status).toBe('failed');
			expect(recoveredRun!.errorMessage).toContain('interrupted');

			// Verify attempt record is completely intact
			const attempts = await db
				.select()
				.from(extractionAttempts)
				.where(eq(extractionAttempts.runId, staleRun!.id));
			expect(attempts.length).toBe(1);
			expect(attempts[0]!.totalTokens).toBe(500);

			// Cleanup test run 99
			await db.delete(extractionRuns).where(eq(extractionRuns.id, staleRun!.id));
		});
	});
});
