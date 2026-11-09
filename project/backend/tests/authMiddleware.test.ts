import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../src/db';
import { users, sessions, transcripts, userStories, acceptanceCriteria, extractionRuns, extractionAttempts } from '../src/db/schema';
import { hashPassword, sha256Hex, buildSessionCookie, SESSION_COOKIE_NAME } from '../src/utils/auth';
import { createSession } from '../src/services/auth';
import { authenticateRequest, requireAuth, requireRole } from '../src/middleware/auth';
import type { SessionContext } from '../src/services/auth';
import {
	checkTranscriptOwnership,
	checkUserStoryOwnership,
	checkAcceptanceCriteriaOwnership,
	checkExtractionRunOwnership,
	checkExtractionAttemptOwnership
} from '../src/middleware/ownership';
import { eq } from 'drizzle-orm';

/**
 * Phase 4A — Authorization middleware & ownership helper tests.
 *
 * These tests use the isolated kapsel_test database and do not modify
 * existing tests or schema.
 */
describe('Phase 4A — Authorization Middleware & Ownership', () => {
	// Shared user records
	let regularUserId: string;
	let adminUserId: string;
	let otherUserId: string;
	let regularRawToken: string;
	let adminRawToken: string;
	let expiredRawToken: string;
	let inactiveUserId: string;
	let inactiveRawToken: string;

	// Resource IDs for ownership tests
	let ownedTranscriptId: number;
	let otherTranscriptId: number;
	let ownedUserStoryId: number;
	let otherUserStoryId: number;
	let ownedCriterionId: number;
	let otherCriterionId: number;
	let ownedRunId: number;
	let otherRunId: number;
	let ownedAttemptId: number;
	let otherAttemptId: number;

	beforeAll(async () => {
		// Clean up any leftover test data
		await db.delete(extractionAttempts);
		await db.delete(extractionRuns);
		await db.delete(acceptanceCriteria);
		await db.delete(userStories);
		await db.delete(transcripts);
		await db.delete(sessions);
		await db.delete(users);

		// Create regular user
		const [regular] = await db
			.insert(users)
			.values({
				email: 'phase4a-regular@test.com',
				passwordHash: await hashPassword('RegularPass123!'),
				role: 'user',
				isActive: true
			})
			.returning();
		regularUserId = regular.id;

		// Create admin user
		const [admin] = await db
			.insert(users)
			.values({
				email: 'phase4a-admin@test.com',
				passwordHash: await hashPassword('AdminPass123!'),
				role: 'admin',
				isActive: true
			})
			.returning();
		adminUserId = admin.id;

		// Create other regular user (for cross-user ownership tests)
		const [other] = await db
			.insert(users)
			.values({
				email: 'phase4a-other@test.com',
				passwordHash: await hashPassword('OtherPass123!'),
				role: 'user',
				isActive: true
			})
			.returning();
		otherUserId = other.id;

		// Create inactive user
		const [inactive] = await db
			.insert(users)
			.values({
				email: 'phase4a-inactive@test.com',
				passwordHash: await hashPassword('InactivePass123!'),
				role: 'user',
				isActive: false
			})
			.returning();
		inactiveUserId = inactive.id;

		// Create sessions
		const regularSession = await createSession(regularUserId);
		regularRawToken = regularSession.rawToken;

		const adminSession = await createSession(adminUserId);
		adminRawToken = adminSession.rawToken;

		// Create expired session (-1 hour TTL)
		const expiredSession = await createSession(regularUserId, -3600);
		expiredRawToken = expiredSession.rawToken;

		// Create session for inactive user
		const inactiveSession = await createSession(inactiveUserId);
		inactiveRawToken = inactiveSession.rawToken;

		// --- Create resources for ownership tests ---

		// Transcripts owned by regularUser
		const [ownedT] = await db
			.insert(transcripts)
			.values({
				userId: regularUserId,
				rawText: 'Owned transcript text',
				originalFilename: 'owned.txt',
				status: 'queued'
			})
			.returning();
		ownedTranscriptId = ownedT.id;

		// Transcript owned by otherUser
		const [otherT] = await db
			.insert(transcripts)
			.values({
				userId: otherUserId,
				rawText: 'Other user transcript text',
				originalFilename: 'other.txt',
				status: 'queued'
			})
			.returning();
		otherTranscriptId = otherT.id;

		// User story under owned transcript
		const [ownedUS] = await db
			.insert(userStories)
			.values({
				transcriptId: ownedTranscriptId,
				role: 'Test User',
				feature: 'test feature',
				benefit: 'test benefit',
				status: 'draft'
			})
			.returning();
		ownedUserStoryId = ownedUS.id;

		// User story under other user's transcript
		const [otherUS] = await db
			.insert(userStories)
			.values({
				transcriptId: otherTranscriptId,
				role: 'Other User',
				feature: 'other feature',
				benefit: 'other benefit',
				status: 'draft'
			})
			.returning();
		otherUserStoryId = otherUS.id;

		// Acceptance criteria under owned user story
		const [ownedAC] = await db
			.insert(acceptanceCriteria)
			.values({
				userStoryId: ownedUserStoryId,
				givenText: 'Given owned',
				whenText: 'When owned',
				thenText: 'Then owned',
				sortOrder: 1
			})
			.returning();
		ownedCriterionId = ownedAC.id;

		// Acceptance criteria under other user's story
		const [otherAC] = await db
			.insert(acceptanceCriteria)
			.values({
				userStoryId: otherUserStoryId,
				givenText: 'Given other',
				whenText: 'When other',
				thenText: 'Then other',
				sortOrder: 1
			})
			.returning();
		otherCriterionId = otherAC.id;

		// Extraction run under owned transcript
		const [ownedER] = await db
			.insert(extractionRuns)
			.values({
				transcriptId: ownedTranscriptId,
				runNumber: 1,
				status: 'completed'
			})
			.returning();
		ownedRunId = ownedER.id;

		// Extraction run under other user's transcript
		const [otherER] = await db
			.insert(extractionRuns)
			.values({
				transcriptId: otherTranscriptId,
				runNumber: 1,
				status: 'completed'
			})
			.returning();
		otherRunId = otherER.id;

		// Extraction attempt under owned run
		const [ownedEA] = await db
			.insert(extractionAttempts)
			.values({
				runId: ownedRunId,
				attemptNumber: 1,
				modelName: 'test-model',
				isFallback: false,
				durationMs: 100,
				status: 'success'
			})
			.returning();
		ownedAttemptId = ownedEA.id;

		// Extraction attempt under other user's run
		const [otherEA] = await db
			.insert(extractionAttempts)
			.values({
				runId: otherRunId,
				attemptNumber: 1,
				modelName: 'test-model',
				isFallback: false,
				durationMs: 200,
				status: 'success'
			})
			.returning();
		otherAttemptId = otherEA.id;
	});

	afterAll(async () => {
		// Clean up all test data
		await db.delete(extractionAttempts);
		await db.delete(extractionRuns);
		await db.delete(acceptanceCriteria);
		await db.delete(userStories);
		await db.delete(transcripts);
		await db.delete(sessions);
		await db.delete(users);
	});

	// ─────────────────────────────────────────────
	// A. authenticateRequest / requireAuth
	// ─────────────────────────────────────────────

	describe('authenticateRequest', () => {
		it('should return 401 when session cookie is missing', async () => {
			const req = new Request('http://localhost:3000/api/test', { method: 'GET' });
			const result = await authenticateRequest(req);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.status).toBe(401);
				expect(result.error).toContain('missing session cookie');
			}
		});

		it('should return 401 for an invalid / forged session token', async () => {
			const forgedToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${forgedToken}` }
			});
			const result = await authenticateRequest(req);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.status).toBe(401);
				expect(result.error).toContain('invalid, expired, or inactive');
			}
		});

		it('should return 401 for an expired session', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${expiredRawToken}` }
			});
			const result = await authenticateRequest(req);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.status).toBe(401);
			}
		});

		it('should return 401 for an inactive user even with valid session token', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${inactiveRawToken}` }
			});
			const result = await authenticateRequest(req);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.status).toBe(401);
			}
		});

		it('should succeed for an active regular user with a valid session', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${regularRawToken}` }
			});
			const result = await authenticateRequest(req);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.context.user.id).toBe(regularUserId);
				expect(result.context.user.email).toBe('phase4a-regular@test.com');
				expect(result.context.user.role).toBe('user');
				expect(result.context.user.isActive).toBe(true);
				// Ensure password hash is NOT present in the context
				expect((result.context.user as any).passwordHash).toBeUndefined();
			}
		});

		it('should succeed for an active admin user with a valid session', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${adminRawToken}` }
			});
			const result = await authenticateRequest(req);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.context.user.id).toBe(adminUserId);
				expect(result.context.user.role).toBe('admin');
				expect(result.context.user.isActive).toBe(true);
			}
		});
	});

	describe('requireAuth', () => {
		it('should return the same result as authenticateRequest for valid sessions', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${regularRawToken}` }
			});
			const result = await requireAuth(req);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.context.user.id).toBe(regularUserId);
			}
		});

		it('should return failure for missing session', async () => {
			const req = new Request('http://localhost:3000/api/test', { method: 'GET' });
			const result = await requireAuth(req);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.status).toBe(401);
			}
		});
	});

	// ─────────────────────────────────────────────
	// B. requireRole
	// ─────────────────────────────────────────────

	describe('requireRole', () => {
		it('should reject a regular user requesting admin role', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${regularRawToken}` }
			});
			const auth = await authenticateRequest(req);
			expect(auth.success).toBe(true);
			if (auth.success) {
				const roleCheck = requireRole(auth.context, 'admin');
				expect(roleCheck.success).toBe(false);
				if (!roleCheck.success) {
					expect(roleCheck.status).toBe(403);
					expect(roleCheck.error).toContain('Forbidden');
				}
			}
		});

		it('should accept an admin user requesting admin role', async () => {
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${adminRawToken}` }
			});
			const auth = await authenticateRequest(req);
			expect(auth.success).toBe(true);
			if (auth.success) {
				const roleCheck = requireRole(auth.context, 'admin');
				expect(roleCheck.success).toBe(true);
			}
		});

		it('should not allow a client-supplied role to elevate privileges', async () => {
			// Even if a client somehow claims to be admin in a header or body,
			// requireRole uses the DB-backed context, not any client value.
			const req = new Request('http://localhost:3000/api/test', {
				method: 'GET',
				headers: {
					Cookie: `${SESSION_COOKIE_NAME}=${regularRawToken}`,
					'X-Role': 'admin' // Attacker-supplied header
				}
			});
			const auth = await authenticateRequest(req);
			expect(auth.success).toBe(true);
			if (auth.success) {
				// The context role comes from the database, not X-Role header
				expect(auth.context.user.role).toBe('user');
				const roleCheck = requireRole(auth.context, 'admin');
				expect(roleCheck.success).toBe(false);
			}
		});
	});

	// ─────────────────────────────────────────────
	// C. Ownership checks
	// ─────────────────────────────────────────────

	describe('Transcript ownership', () => {
		it('should confirm ownership for the owner', async () => {
			const result = await checkTranscriptOwnership(ownedTranscriptId, regularUserId);
			expect(result.status).toBe('owned');
		});

		it('should deny ownership for a different user', async () => {
			const result = await checkTranscriptOwnership(ownedTranscriptId, otherUserId);
			expect(result.status).toBe('forbidden');
		});

		it('should return not_found for a non-existent transcript', async () => {
			const result = await checkTranscriptOwnership(999999, regularUserId);
			expect(result.status).toBe('not_found');
		});

		it('should deny ownership for an admin (no automatic bypass)', async () => {
			const result = await checkTranscriptOwnership(ownedTranscriptId, adminUserId);
			expect(result.status).toBe('forbidden');
		});
	});

	describe('User Story ownership (derived through transcript)', () => {
		it('should confirm ownership for the transcript owner', async () => {
			const result = await checkUserStoryOwnership(ownedUserStoryId, regularUserId);
			expect(result.status).toBe('owned');
		});

		it('should deny ownership for a different user', async () => {
			const result = await checkUserStoryOwnership(ownedUserStoryId, otherUserId);
			expect(result.status).toBe('forbidden');
		});

		it('should return not_found for a non-existent user story', async () => {
			const result = await checkUserStoryOwnership(999999, regularUserId);
			expect(result.status).toBe('not_found');
		});

		it('should deny ownership for an admin (no automatic bypass)', async () => {
			const result = await checkUserStoryOwnership(ownedUserStoryId, adminUserId);
			expect(result.status).toBe('forbidden');
		});
	});

	describe('Acceptance Criteria ownership (derived through user story → transcript)', () => {
		it('should confirm ownership for the transcript owner', async () => {
			const result = await checkAcceptanceCriteriaOwnership(ownedCriterionId, regularUserId);
			expect(result.status).toBe('owned');
		});

		it('should deny ownership for a different user', async () => {
			const result = await checkAcceptanceCriteriaOwnership(ownedCriterionId, otherUserId);
			expect(result.status).toBe('forbidden');
		});

		it('should return not_found for a non-existent criterion', async () => {
			const result = await checkAcceptanceCriteriaOwnership(999999, regularUserId);
			expect(result.status).toBe('not_found');
		});
	});

	describe('Extraction Run ownership (derived through transcript)', () => {
		it('should confirm ownership for the transcript owner', async () => {
			const result = await checkExtractionRunOwnership(ownedRunId, regularUserId);
			expect(result.status).toBe('owned');
		});

		it('should deny ownership for a different user', async () => {
			const result = await checkExtractionRunOwnership(ownedRunId, otherUserId);
			expect(result.status).toBe('forbidden');
		});

		it('should return not_found for a non-existent run', async () => {
			const result = await checkExtractionRunOwnership(999999, regularUserId);
			expect(result.status).toBe('not_found');
		});
	});

	describe('Extraction Attempt ownership (derived through run → transcript)', () => {
		it('should confirm ownership for the transcript owner', async () => {
			const result = await checkExtractionAttemptOwnership(ownedAttemptId, regularUserId);
			expect(result.status).toBe('owned');
		});

		it('should deny ownership for a different user', async () => {
			const result = await checkExtractionAttemptOwnership(ownedAttemptId, otherUserId);
			expect(result.status).toBe('forbidden');
		});

		it('should return not_found for a non-existent attempt', async () => {
			const result = await checkExtractionAttemptOwnership(999999, regularUserId);
			expect(result.status).toBe('not_found');
		});
	});

	describe('Cross-resource ownership verification', () => {
		it('should correctly trace ownership for a deeply nested resource (attempt → run → transcript → user)', async () => {
			// otherUser's attempt should be denied for regularUser
			const result = await checkExtractionAttemptOwnership(otherAttemptId, regularUserId);
			expect(result.status).toBe('forbidden');

			// otherUser's attempt should be owned by otherUser
			const result2 = await checkExtractionAttemptOwnership(otherAttemptId, otherUserId);
			expect(result2.status).toBe('owned');
		});

		it('should correctly trace ownership for acceptance criteria belonging to the other user', async () => {
			const result = await checkAcceptanceCriteriaOwnership(otherCriterionId, regularUserId);
			expect(result.status).toBe('forbidden');

			const result2 = await checkAcceptanceCriteriaOwnership(otherCriterionId, otherUserId);
			expect(result2.status).toBe('owned');
		});
	});
});

