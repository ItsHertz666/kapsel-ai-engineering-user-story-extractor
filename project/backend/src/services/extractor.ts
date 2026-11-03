import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db';
import {
	transcripts,
	userStories,
	acceptanceCriteria,
	extractionRuns,
	extractionAttempts,
	type extractionAttemptStatusEnum
} from '../db/schema';
import { calculateAttemptCost } from '../utils/pricing';

export const SYSTEM_PROMPT = `Anda adalah seorang System Analyst profesional. Tugas Anda adalah mengekstrak kebutuhan fungsional (functional requirements) dari transkrip rapat berbahasa Indonesia menjadi User Story dan Acceptance Criteria.

Aturan yang WAJIB dipatuhi:
1. Input berupa transkrip percakapan rapat informal berbahasa Indonesia yang memuat obrolan santai, basa-basi, atau topik di luar sistem; abaikan semua hal yang bukan kebutuhan sistem perangkat lunak.
2. Ekstrak HANYA kebutuhan fungsional yang benar-benar disetujui, disebutkan, dan dibahas di dalam transkrip. Jangan pernah mengarang atau menambahkan fitur baru yang tidak dibicarakan.
3. Satu User Story HANYA untuk SATU peran (role). Jika dua peran terlibat dalam satu alur yang sama (misalnya karyawan mengajukan koreksi absen dan atasan menyetujui atau menolak koreksi), BUAT User Story terpisah untuk masing-masing peran tersebut.
4. Field 'role', 'feature', dan 'benefit' HANYA berisi frasa intinya saja, TANPA awalan "Sebagai", "Saya ingin", "Aku ingin", "Agar", atau "Supaya".
   - Contoh benar:
     - role: "HR manager" (BUKAN "Sebagai HR manager")
     - feature: "melihat rekap kehadiran karyawan per bulan" (BUKAN "Saya ingin melihat rekap kehadiran karyawan per bulan")
     - benefit: "menghitung gaji dengan mudah" (BUKAN "Agar dapat menghitung gaji dengan mudah")
   Serta harus memenuhi prinsip INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable).
5. Field 'out_of_scope' berisi daftar singkat fitur yang di transkrip dinyatakan ditunda, belum prioritas, atau di luar scope (misalnya notifikasi email ke karyawan, pembayaran gaji otomatis). Isi dan tentukan 'out_of_scope' LEBIH DULU sebelum menulis 'user_stories'.
6. TIDAK SATU PUN item di 'out_of_scope' boleh muncul sebagai User Story dan TIDAK BOLEH disebut sebagai langkah apa pun di dalam Acceptance Criteria (baik pada given, when, maupun then).
7. Acceptance Criteria hanya boleh memuat perilaku yang dibahas atau langsung tersirat dari transkrip. Jangan menambah detail antarmuka atau fitur yang tidak disebut (seperti nama tombol, isi formulir, pesan error dengan teks tertentu, halaman detail, nama field, maupun teknologi spesifik seperti GPS). Gunakan kalimat perilaku yang generik, misalnya "karyawan berada di lokasi kantor".
8. Setiap User Story harus memiliki 1 hingga 4 Acceptance Criteria dalam format Gherkin:
   - given: Kondisi awal (prasyarat)
   - when: Aksi yang dilakukan pengguna atau pemicu
   - then: Hasil atau perilaku sistem yang diharapkan
9. Jika benefit/manfaat tidak diucapkan secara eksplisit, simpulkan secara minimal berdasarkan konteks pembicaraan, namun dilarang keras menambahkan fitur baru.
10. Hasilkan HANYA JSON valid tanpa teks pembuka, penutup, maupun markdown code fences (\`\`\`json atau \`\`\`), dengan struktur persis seperti berikut:
{"out_of_scope":["fitur A yang ditunda atau di luar scope","fitur B"],"user_stories":[{"role":"...","feature":"...","benefit":"...","acceptance_criteria":[{"given":"...","when":"...","then":"..."}]}]}
11. Jika tidak ada fitur yang di luar scope, isi array kosong: "out_of_scope": []. Jika tidak ada kebutuhan fungsional di dalam transkrip, isi: "user_stories": [].`;

export interface ParsedAcceptanceCriteria {
	given: string;
	when: string;
	then: string;
}

export interface ParsedUserStory {
	role: string;
	feature: string;
	benefit: string;
	acceptance_criteria: ParsedAcceptanceCriteria[];
}

export interface ExtractorOutput {
	out_of_scope?: string[];
	user_stories: ParsedUserStory[];
}

export interface RecordedAttemptContext {
	runId: number;
	attemptNumber: number;
	modelName: string;
	isFallback: boolean;
	httpStatusCode: number | null;
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	durationMs: number;
	status: (typeof extractionAttemptStatusEnum.enumValues)[number];
	errorMessage: string | null;
}

export interface AttemptLogHandler {
	recordAttemptStart: (
		modelName: string,
		isFallback: boolean
	) => Promise<number>; // returns attemptNumber
	recordResponseReceived: (params: {
		attemptNumber: number;
		modelName: string;
		isFallback: boolean;
		httpStatusCode: number;
		durationMs: number;
		promptTokens: number | null;
		completionTokens: number | null;
		totalTokens: number | null;
	}) => Promise<number>; // returns attemptId
	updateAttemptStatus: (
		attemptId: number,
		status: 'success' | 'parse_error',
		errorMessage?: string | null
	) => Promise<void>;
	recordHttpOrNetworkError: (params: {
		attemptNumber: number;
		modelName: string;
		isFallback: boolean;
		httpStatusCode: number | null;
		durationMs: number;
		status: 'api_error' | 'network_error';
		errorMessage: string;
	}) => Promise<number>;
}

export interface CallOpenRouterResult {
	content: string;
	model: string;
	attemptId: number;
}

export async function callOpenRouter(
	transcriptText: string,
	attemptLogger?: AttemptLogHandler
): Promise<CallOpenRouterResult> {
	const apiKey = Bun.env.OPENROUTER_API_KEY;
	const primaryModel = Bun.env.OPENROUTER_MODEL;
	const fallbackModel = Bun.env.OPENROUTER_FALLBACK_MODEL;

	if (!apiKey) {
		throw new Error('OPENROUTER_API_KEY is not defined in environment variables');
	}
	if (!primaryModel) {
		throw new Error('OPENROUTER_MODEL is not defined in environment variables');
	}

	const rawTemp = Bun.env.OPENROUTER_TEMPERATURE;
	let temperature = 0;
	if (rawTemp !== undefined && rawTemp.trim() !== '') {
		const parsedTemp = Number(rawTemp);
		if (!isNaN(parsedTemp) && parsedTemp >= 0 && parsedTemp <= 2) {
			temperature = parsedTemp;
		}
	}

	const url = 'https://openrouter.ai/api/v1/chat/completions';
	const messages = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: transcriptText }
	];

	const sendSingleRequest = async (modelToUse: string, isFallback: boolean) => {
		const basePayload = {
			model: modelToUse,
			messages,
			temperature,
			max_tokens: 4000
		};

		const startReqTime = Date.now();
		let currentAttemptNumber = 0;
		if (attemptLogger) {
			currentAttemptNumber = await attemptLogger.recordAttemptStart(modelToUse, isFallback);
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					...basePayload,
					reasoning: { enabled: false },
					response_format: { type: 'json_object' }
				})
			});

			// If HTTP 400 (unsupported optional params), retry once cleanly
			if (response.status === 400) {
				response = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify(basePayload)
				});
			}
		} catch (netErr: any) {
			const durationMs = Date.now() - startReqTime;
			const errorMsg = (netErr?.message || String(netErr)).slice(0, 500);
			if (attemptLogger) {
				await attemptLogger.recordHttpOrNetworkError({
					attemptNumber: currentAttemptNumber,
					modelName: modelToUse,
					isFallback,
					httpStatusCode: null,
					durationMs,
					status: 'network_error',
					errorMessage: errorMsg
				});
			}
			throw netErr;
		}

		const durationMs = Date.now() - startReqTime;

		if (!response.ok) {
			const errorBody = await response.text();
			const errorMsg = `Status ${response.status}: ${errorBody}`.slice(0, 500);
			if (attemptLogger) {
				await attemptLogger.recordHttpOrNetworkError({
					attemptNumber: currentAttemptNumber,
					modelName: modelToUse,
					isFallback,
					httpStatusCode: response.status,
					durationMs,
					status: 'api_error',
					errorMessage: errorMsg
				});
			}
			return { response, attemptId: 0, errorBody };
		}

		// Response is HTTP 200 OK
		const data = (await response.json()) as any;
		const content = data?.choices?.[0]?.message?.content;
		const model = data?.model || modelToUse;

		const promptTokens = typeof data?.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : null;
		const completionTokens = typeof data?.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : null;
		const totalTokens = typeof data?.usage?.total_tokens === 'number' ? data.usage.total_tokens : null;

		let attemptId = 0;
		if (attemptLogger) {
			attemptId = await attemptLogger.recordResponseReceived({
				attemptNumber: currentAttemptNumber,
				modelName: model,
				isFallback,
				httpStatusCode: response.status,
				durationMs,
				promptTokens,
				completionTokens,
				totalTokens
			});
		}

		return { response, attemptId, data, content, model };
	};

	const retryableStatuses = [429, 502, 503];
	const delays = [3000, 6000, 12000];

	// Initial attempt on primary model
	let lastReqResult = await sendSingleRequest(primaryModel, false);

	for (let i = 0; i < delays.length && retryableStatuses.includes(lastReqResult.response.status); i++) {
		const delay = delays[i]!;
		const attempt = i + 1;
		console.log(`[callOpenRouter] Received status ${lastReqResult.response.status}. Retrying attempt ${attempt}/3 after ${delay / 1000}s...`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		lastReqResult = await sendSingleRequest(primaryModel, false);
	}

	// Fallback model attempt if primary completely failed
	if (!lastReqResult.response.ok && fallbackModel) {
		console.log(`[callOpenRouter] All attempts failed on ${primaryModel} (status ${lastReqResult.response.status}). Trying fallback: ${fallbackModel}...`);
		lastReqResult = await sendSingleRequest(fallbackModel, true);
	}

	if (!lastReqResult.response.ok) {
		throw new Error(`OpenRouter API error: ${lastReqResult.errorBody || lastReqResult.response.statusText}`);
	}

	const content = lastReqResult.content;
	const model = lastReqResult.model;

	if (!content || typeof content !== 'string' || content.trim() === '') {
		throw new Error('OpenRouter API returned no content in choices[0].message.content');
	}

	return { content, model, attemptId: lastReqResult.attemptId };
}

export function parseModelOutput(rawContent: string): ExtractorOutput {
	let cleaned = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

	const firstBrace = cleaned.indexOf('{');
	const lastBrace = cleaned.lastIndexOf('}');

	if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
		const snippet = rawContent.slice(0, 300);
		throw new Error(`Failed to locate JSON object in model output. First 300 chars: ${snippet}`);
	}

	cleaned = cleaned.substring(firstBrace, lastBrace + 1);

	let parsed: any;
	try {
		parsed = JSON.parse(cleaned);
	} catch (e) {
		const snippet = rawContent.slice(0, 300);
		throw new Error(`Failed to parse model output as JSON. First 300 chars: ${snippet}`);
	}

	if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.user_stories)) {
		const snippet = rawContent.slice(0, 300);
		throw new Error(`Invalid JSON format: missing user_stories array. First 300 chars: ${snippet}`);
	}

	const cleanPrefixes = (text: string): string => {
		return text
			.replace(/^(?:sebagai|saya ingin|aku ingin|agar|supaya)\s+/i, '')
			.trim();
	};

	const validUserStories: ParsedUserStory[] = [];

	for (const story of parsed.user_stories) {
		if (
			!story ||
			typeof story !== 'object' ||
			typeof story.role !== 'string' ||
			story.role.trim() === '' ||
			typeof story.feature !== 'string' ||
			story.feature.trim() === '' ||
			typeof story.benefit !== 'string' ||
			story.benefit.trim() === ''
		) {
			continue;
		}

		const cleanedRole = cleanPrefixes(story.role);
		const cleanedFeature = cleanPrefixes(story.feature);
		const cleanedBenefit = cleanPrefixes(story.benefit);

		if (!cleanedRole || !cleanedFeature || !cleanedBenefit) {
			continue;
		}

		const validCriteria: ParsedAcceptanceCriteria[] = [];
		if (Array.isArray(story.acceptance_criteria)) {
			for (const criteria of story.acceptance_criteria) {
				if (
					criteria &&
					typeof criteria === 'object' &&
					typeof criteria.given === 'string' &&
					criteria.given.trim() !== '' &&
					typeof criteria.when === 'string' &&
					criteria.when.trim() !== '' &&
					typeof criteria.then === 'string' &&
					criteria.then.trim() !== ''
				) {
					validCriteria.push({
						given: criteria.given.trim(),
						when: criteria.when.trim(),
						then: criteria.then.trim()
					});
				}
			}
		}

		validUserStories.push({
			role: cleanedRole,
			feature: cleanedFeature,
			benefit: cleanedBenefit,
			acceptance_criteria: validCriteria
		});
	}

	const outOfScope: string[] = [];
	if (Array.isArray(parsed.out_of_scope)) {
		for (const item of parsed.out_of_scope) {
			if (typeof item === 'string' && item.trim() !== '') {
				outOfScope.push(item.trim());
			}
		}
	}

	return {
		out_of_scope: outOfScope,
		user_stories: validUserStories
	};
}

/**
 * Recovers stale extraction runs left in 'processing' status.
 * Run is marked 'failed' after staleThresholdMs (default 10 minutes), preserving attempt history.
 */
export async function recoverStaleRuns(staleThresholdMs = 10 * 60 * 1000): Promise<number> {
	const cutoff = new Date(Date.now() - staleThresholdMs).toISOString();

	const staleRuns = await db
		.select({ id: extractionRuns.id })
		.from(extractionRuns)
		.where(
			and(
				eq(extractionRuns.status, 'processing'),
				sql`${extractionRuns.startedAt} < ${cutoff}::timestamp`
			)
		);

	if (staleRuns.length === 0) {
		return 0;
	}

	for (const run of staleRuns) {
		await db
			.update(extractionRuns)
			.set({
				status: 'failed',
				errorMessage: 'Execution timed out or backend process was interrupted.',
				completedAt: new Date()
			})
			.where(eq(extractionRuns.id, run.id));
	}

	return staleRuns.length;
}

export interface ProcessTranscriptResult {
	id: number;
	run_id: number;
	run_number: number;
	status: 'completed';
	user_stories_count: number;
	attempts_count: number;
	total_prompt_tokens: number | null;
	total_completion_tokens: number | null;
	total_tokens: number | null;
	estimated_cost_usd: number | null;
}

export async function processTranscript(transcriptId: number): Promise<ProcessTranscriptResult> {
	// First: Run recovery for stale runs before proceeding
	await recoverStaleRuns();

	// Step 1: Short DB transaction to lock transcript row, check concurrency, allocate run_number, and insert new run
	const newRun = await db.transaction(async (tx) => {
		// Row-level lock on transcript
		const [lockedTranscript] = await tx
			.select()
			.from(transcripts)
			.where(eq(transcripts.id, transcriptId))
			.for('update');

		if (!lockedTranscript) {
			const err = new Error(`Transcript with ID ${transcriptId} not found`);
			(err as any).statusCode = 404;
			throw err;
		}

		// Check if there is an active run in 'processing'
		const [activeRun] = await tx
			.select()
			.from(extractionRuns)
			.where(
				and(
					eq(extractionRuns.transcriptId, transcriptId),
					eq(extractionRuns.status, 'processing')
				)
			);

		if (activeRun) {
			const err = new Error(
				`Transcript ${transcriptId} is currently being processed by run #${activeRun.runNumber}`
			);
			(err as any).statusCode = 409;
			throw err;
		}

		// Calculate next run_number
		const [latestRun] = await tx
			.select({ maxRun: sql<number>`COALESCE(MAX(${extractionRuns.runNumber}), 0)` })
			.from(extractionRuns)
			.where(eq(extractionRuns.transcriptId, transcriptId));

		const nextRunNumber = (Number(latestRun?.maxRun) || 0) + 1;

		const [createdRun] = await tx
			.insert(extractionRuns)
			.values({
				transcriptId,
				runNumber: nextRunNumber,
				status: 'processing'
			})
			.returning();

		if (!createdRun) {
			throw new Error('Failed to create extraction run record');
		}

		// Update transcript status to 'processing'
		await tx
			.update(transcripts)
			.set({
				status: 'processing',
				errorMessage: null,
				updatedAt: new Date()
			})
			.where(eq(transcripts.id, transcriptId));

		return { createdRun, rawText: lockedTranscript.rawText };
	});

	const runId = newRun.createdRun.id;
	const runNumber = newRun.createdRun.runNumber;
	const rawText = newRun.rawText;

	// Prepare attempt logging handlers
	let attemptSeq = 0;
	const attemptLogger: AttemptLogHandler = {
		recordAttemptStart: async () => {
			attemptSeq++;
			return attemptSeq;
		},
		recordResponseReceived: async ({
			attemptNumber,
			modelName,
			isFallback,
			httpStatusCode,
			durationMs,
			promptTokens,
			completionTokens,
			totalTokens
		}) => {
			const costData = calculateAttemptCost(modelName, promptTokens, completionTokens);
			const [inserted] = await db
				.insert(extractionAttempts)
				.values({
					runId,
					attemptNumber,
					modelName,
					isFallback,
					httpStatusCode,
					promptTokens,
					completionTokens,
					totalTokens,
					durationMs,
					status: 'response_received',
					promptRatePerMillionUsd: costData.promptRatePerMillionUsd,
					completionRatePerMillionUsd: costData.completionRatePerMillionUsd,
					estimatedCostUsd: costData.estimatedCostUsd,
					errorMessage: null
				})
				.returning({ id: extractionAttempts.id });
			return inserted?.id ?? 0;
		},
		updateAttemptStatus: async (attemptId, status, errorMessage) => {
			await db
				.update(extractionAttempts)
				.set({
					status,
					errorMessage: errorMessage ? errorMessage.slice(0, 500) : null
				})
				.where(eq(extractionAttempts.id, attemptId));
		},
		recordHttpOrNetworkError: async ({
			attemptNumber,
			modelName,
			isFallback,
			httpStatusCode,
			durationMs,
			status,
			errorMessage
		}) => {
			const costData = calculateAttemptCost(modelName, null, null);
			const [inserted] = await db
				.insert(extractionAttempts)
				.values({
					runId,
					attemptNumber,
					modelName,
					isFallback,
					httpStatusCode,
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					durationMs,
					status,
					promptRatePerMillionUsd: costData.promptRatePerMillionUsd,
					completionRatePerMillionUsd: costData.completionRatePerMillionUsd,
					estimatedCostUsd: null,
					errorMessage: errorMessage.slice(0, 500)
				})
				.returning({ id: extractionAttempts.id });
			return inserted?.id ?? 0;
		}
	};

	const maxAttempts = 3;
	let parsed: ExtractorOutput | null = null;
	let lastParseError: any = null;

	try {
		for (let parseAttempt = 1; parseAttempt <= maxAttempts; parseAttempt++) {
			console.log(`[processTranscript] Run #${runNumber} Attempt ${parseAttempt}/${maxAttempts}...`);
			let callResult: CallOpenRouterResult;
			try {
				callResult = await callOpenRouter(rawText, attemptLogger);
			} catch (callErr: any) {
				lastParseError = callErr;
				break; // Cannot reach OpenRouter or fatal config error
			}

			try {
				parsed = parseModelOutput(callResult.content);
				if (callResult.attemptId) {
					await attemptLogger.updateAttemptStatus(callResult.attemptId, 'success');
				}
				break; // Successfully parsed!
			} catch (parseErr: any) {
				lastParseError = parseErr;
				if (callResult.attemptId) {
					await attemptLogger.updateAttemptStatus(
						callResult.attemptId,
						'parse_error',
						parseErr?.message || String(parseErr)
					);
				}
				if (parseAttempt < maxAttempts) {
					console.log(`[processTranscript] Retrying callOpenRouter + parseModelOutput...`);
				}
			}
		}

		if (!parsed) {
			const detailedMsg = `Failed to extract user stories after attempts. Last error: ${lastParseError?.message || lastParseError}`;
			throw new Error(detailedMsg);
		}

		const validatedParsed: ExtractorOutput = parsed;

		// Atomic transaction for updating user stories and marking run & transcript completed
		await db.transaction(async (tx) => {
			await tx
				.delete(userStories)
				.where(eq(userStories.transcriptId, transcriptId));

			for (const story of validatedParsed.user_stories) {
				const [insertedStory] = await tx
					.insert(userStories)
					.values({
						transcriptId,
						role: story.role,
						feature: story.feature,
						benefit: story.benefit,
						rawAiOutput: {
							...story,
							out_of_scope: validatedParsed.out_of_scope || []
						},
						status: 'draft'
					})
					.returning({ id: userStories.id });

				if (insertedStory && story.acceptance_criteria.length > 0) {
					await tx.insert(acceptanceCriteria).values(
						story.acceptance_criteria.map((ac, index) => ({
							userStoryId: insertedStory.id,
							givenText: ac.given,
							whenText: ac.when,
							thenText: ac.then,
							sortOrder: index + 1
						}))
					);
				}
			}

			// Mark extraction run as completed
			await tx
				.update(extractionRuns)
				.set({
					status: 'completed',
					errorMessage: null,
					completedAt: new Date()
				})
				.where(eq(extractionRuns.id, runId));

			// Mark transcript as completed
			await tx
				.update(transcripts)
				.set({
					status: 'completed',
					errorMessage: null,
					updatedAt: new Date()
				})
				.where(eq(transcripts.id, transcriptId));
		});

		// Calculate aggregated metrics for this run
		const runAttempts = await db
			.select()
			.from(extractionAttempts)
			.where(eq(extractionAttempts.runId, runId));

		let sumPrompt: number | null = 0;
		let sumCompletion: number | null = 0;
		let sumTotal: number | null = 0;
		let sumCost: number | null = 0;

		for (const a of runAttempts) {
			if (a.promptTokens !== null) sumPrompt = (sumPrompt ?? 0) + a.promptTokens;
			if (a.completionTokens !== null) sumCompletion = (sumCompletion ?? 0) + a.completionTokens;
			if (a.totalTokens !== null) sumTotal = (sumTotal ?? 0) + a.totalTokens;

			if (a.estimatedCostUsd !== null && sumCost !== null) {
				sumCost += a.estimatedCostUsd;
			} else if (a.status === 'success' || a.status === 'parse_error') {
				// Tokens were billed but cost is unknown
				sumCost = null;
			}
		}

		return {
			id: transcriptId,
			run_id: runId,
			run_number: runNumber,
			status: 'completed',
			user_stories_count: parsed.user_stories.length,
			attempts_count: runAttempts.length,
			total_prompt_tokens: sumPrompt,
			total_completion_tokens: sumCompletion,
			total_tokens: sumTotal,
			estimated_cost_usd: sumCost !== null ? Number(sumCost.toFixed(6)) : null
		};
	} catch (error: any) {
		const message = (error?.message || String(error)).slice(0, 500);

		// Safely record run failure
		try {
			await db
				.update(extractionRuns)
				.set({
					status: 'failed',
					errorMessage: message,
					completedAt: new Date()
				})
				.where(eq(extractionRuns.id, runId));

			await db
				.update(transcripts)
				.set({
					status: 'failed',
					errorMessage: message,
					updatedAt: new Date()
				})
				.where(eq(transcripts.id, transcriptId));
		} catch (dbErr) {
			console.error(`Failed to mark run/transcript failed in DB:`, dbErr);
		}

		throw error;
	}
}
