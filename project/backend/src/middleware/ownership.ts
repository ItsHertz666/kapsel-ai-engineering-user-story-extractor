import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import {
	transcripts,
	userStories,
	acceptanceCriteria,
	extractionRuns,
	extractionAttempts
} from '../db/schema';

/**
 * Result of an ownership check.
 * - `owned`: the resource exists and belongs to the requesting user.
 * - `not_found`: the resource does not exist (or has no owner path to the user).
 * - `forbidden`: the resource exists but belongs to another user.
 *
 * Callers should map `not_found` and `forbidden` to the same HTTP 404
 * to avoid leaking the existence of resources owned by other users.
 */
export type OwnershipResult =
	| { status: 'owned' }
	| { status: 'not_found' }
	| { status: 'forbidden' };

/**
 * Verify that a transcript belongs to the given user.
 *
 * Ownership chain: transcripts.user_id → users.id
 */
export async function checkTranscriptOwnership(
	transcriptId: number,
	userId: string
): Promise<OwnershipResult> {
	const rows = await db
		.select({ userId: transcripts.userId })
		.from(transcripts)
		.where(eq(transcripts.id, transcriptId))
		.limit(1);

	if (rows.length === 0) {
		return { status: 'not_found' };
	}

	return rows[0].userId === userId
		? { status: 'owned' }
		: { status: 'forbidden' };
}

/**
 * Verify that a user story belongs to the given user.
 *
 * Ownership chain: user_stories.transcript_id → transcripts.user_id → users.id
 */
export async function checkUserStoryOwnership(
	userStoryId: number,
	userId: string
): Promise<OwnershipResult> {
	const rows = await db
		.select({ ownerId: transcripts.userId })
		.from(userStories)
		.innerJoin(transcripts, eq(userStories.transcriptId, transcripts.id))
		.where(eq(userStories.id, userStoryId))
		.limit(1);

	if (rows.length === 0) {
		return { status: 'not_found' };
	}

	return rows[0].ownerId === userId
		? { status: 'owned' }
		: { status: 'forbidden' };
}

/**
 * Verify that an acceptance criterion belongs to the given user.
 *
 * Ownership chain:
 *   acceptance_criteria.user_story_id → user_stories.transcript_id → transcripts.user_id → users.id
 */
export async function checkAcceptanceCriteriaOwnership(
	criterionId: number,
	userId: string
): Promise<OwnershipResult> {
	const rows = await db
		.select({ ownerId: transcripts.userId })
		.from(acceptanceCriteria)
		.innerJoin(userStories, eq(acceptanceCriteria.userStoryId, userStories.id))
		.innerJoin(transcripts, eq(userStories.transcriptId, transcripts.id))
		.where(eq(acceptanceCriteria.id, criterionId))
		.limit(1);

	if (rows.length === 0) {
		return { status: 'not_found' };
	}

	return rows[0].ownerId === userId
		? { status: 'owned' }
		: { status: 'forbidden' };
}

/**
 * Verify that an extraction run belongs to the given user.
 *
 * Ownership chain:
 *   extraction_runs.transcript_id → transcripts.user_id → users.id
 */
export async function checkExtractionRunOwnership(
	runId: number,
	userId: string
): Promise<OwnershipResult> {
	const rows = await db
		.select({ ownerId: transcripts.userId })
		.from(extractionRuns)
		.innerJoin(transcripts, eq(extractionRuns.transcriptId, transcripts.id))
		.where(eq(extractionRuns.id, runId))
		.limit(1);

	if (rows.length === 0) {
		return { status: 'not_found' };
	}

	return rows[0].ownerId === userId
		? { status: 'owned' }
		: { status: 'forbidden' };
}

/**
 * Verify that an extraction attempt belongs to the given user.
 *
 * Ownership chain:
 *   extraction_attempts.run_id → extraction_runs.transcript_id → transcripts.user_id → users.id
 */
export async function checkExtractionAttemptOwnership(
	attemptId: number,
	userId: string
): Promise<OwnershipResult> {
	const rows = await db
		.select({ ownerId: transcripts.userId })
		.from(extractionAttempts)
		.innerJoin(extractionRuns, eq(extractionAttempts.runId, extractionRuns.id))
		.innerJoin(transcripts, eq(extractionRuns.transcriptId, transcripts.id))
		.where(eq(extractionAttempts.id, attemptId))
		.limit(1);

	if (rows.length === 0) {
		return { status: 'not_found' };
	}

	return rows[0].ownerId === userId
		? { status: 'owned' }
		: { status: 'forbidden' };
}

