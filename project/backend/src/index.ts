import { eq } from 'drizzle-orm';
import { db } from './db';
import { transcripts, userStories, acceptanceCriteria, userStoryStatusEnum } from './db/schema';
import { processTranscript } from './services/extractor';

const port = Number(Bun.env.PORT) || 3000;

export const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders
		}
	});
}

// Allowed state transitions for user stories
// draft -> edited, approved, rejected
// edited -> approved, rejected
// approved -> edited, rejected (allows re-opening or correcting)
// rejected -> edited, approved (allows re-opening or correcting)
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
	draft: ['edited', 'approved', 'rejected'],
	edited: ['approved', 'rejected'],
	approved: ['edited', 'rejected'],
	rejected: ['edited', 'approved']
};

export async function handleRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const { pathname } = url;

	// Handle CORS Preflight
	if (req.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: corsHeaders
		});
	}

	// POST /api/transcripts
	if (req.method === 'POST' && pathname === '/api/transcripts') {
		let body: { raw_text?: unknown; original_filename?: unknown };
		try {
			body = (await req.json()) as { raw_text?: unknown; original_filename?: unknown };
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400);
		}

		if (!body || typeof body.raw_text !== 'string' || body.raw_text.trim() === '') {
			return jsonResponse({ error: 'raw_text is required and cannot be empty' }, 400);
		}

		try {
			const [newTranscript] = await db
				.insert(transcripts)
				.values({
					rawText: body.raw_text,
					originalFilename:
						typeof body.original_filename === 'string'
							? body.original_filename
							: null
				})
				.returning({
					id: transcripts.id,
					status: transcripts.status
				});

			return jsonResponse(newTranscript, 201);
		} catch (error) {
			console.error('Database error on POST /api/transcripts:', error);
			return jsonResponse({ error: 'Failed to create transcript' }, 500);
		}
	}

	// POST /api/transcripts/:id/process
	const processMatch = pathname.match(/^\/api\/transcripts\/([^/]+)\/process$/);
	if (req.method === 'POST' && processMatch) {
		const id = Number(processMatch[1]);
		if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
			return jsonResponse({ error: 'Invalid transcript ID' }, 400);
		}

		try {
			const result = await processTranscript(id);
			return jsonResponse(result, 200);
		} catch (error: any) {
			if (error?.statusCode === 404 || error?.message?.includes('not found')) {
				return jsonResponse({ error: error.message }, 404);
			}
			console.error(`Error processing transcript ${id}:`, error);
			return jsonResponse({ error: error?.message || 'Processing failed' }, 500);
		}
	}

	// GET /api/transcripts/:id
	const transcriptMatch = pathname.match(/^\/api\/transcripts\/([^/]+)$/);
	if (req.method === 'GET' && transcriptMatch) {
		const id = Number(transcriptMatch[1]);
		if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
			return jsonResponse({ error: 'Invalid transcript ID' }, 400);
		}

		try {
			const transcript = await db.query.transcripts.findFirst({
				where: eq(transcripts.id, id),
				with: {
					userStories: {
						with: {
							acceptanceCriteria: {
								orderBy: (acceptanceCriteria, { asc }) => [
									asc(acceptanceCriteria.sortOrder)
								]
							}
						}
					}
				}
			});

			if (!transcript) {
				return jsonResponse({ error: 'Transcript not found' }, 404);
			}

			return jsonResponse(transcript, 200);
		} catch (error) {
			console.error(`Database error on GET /api/transcripts/${id}:`, error);
			return jsonResponse({ error: 'Failed to fetch transcript' }, 500);
		}
	}

	// PATCH /api/user-stories/:id/status
	const storyStatusMatch = pathname.match(/^\/api\/user-stories\/([^/]+)\/status$/);
	if (req.method === 'PATCH' && storyStatusMatch) {
		const id = Number(storyStatusMatch[1]);
		if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
			return jsonResponse({ error: 'Invalid user story ID' }, 400);
		}

		let body: { status?: unknown };
		try {
			body = (await req.json()) as { status?: unknown };
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400);
		}

		if (!body || typeof body.status !== 'string' || body.status.trim() === '') {
			return jsonResponse({ error: 'status is required and must be a string' }, 400);
		}

		const targetStatus = body.status.trim().toLowerCase();
		const validStatuses: string[] = userStoryStatusEnum.enumValues;
		if (!validStatuses.includes(targetStatus)) {
			return jsonResponse(
				{
					error: `Invalid status: '${body.status}'. Valid statuses are: ${validStatuses.join(', ')}`
				},
				400
			);
		}

		try {
			const [existingStory] = await db
				.select()
				.from(userStories)
				.where(eq(userStories.id, id));

			if (!existingStory) {
				return jsonResponse({ error: 'User story not found' }, 404);
			}

			if (existingStory.status === targetStatus) {
				return jsonResponse(existingStory, 200);
			}

			const allowedTransitions = VALID_STATUS_TRANSITIONS[existingStory.status || 'draft'] || [];
			if (!allowedTransitions.includes(targetStatus)) {
				return jsonResponse(
					{
						error: `Invalid status transition from '${existingStory.status}' to '${targetStatus}'. Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`
					},
					400
				);
			}

			const [updatedStory] = await db
				.update(userStories)
				.set({
					status: targetStatus as (typeof userStoryStatusEnum.enumValues)[number],
					updatedAt: new Date()
				})
				.where(eq(userStories.id, id))
				.returning();

			return jsonResponse(updatedStory, 200);
		} catch (error) {
			console.error(`Database error on PATCH /api/user-stories/${id}/status:`, error);
			return jsonResponse({ error: 'Failed to update user story status' }, 500);
		}
	}

	// PATCH /api/user-stories/:id
	const storyUpdateMatch = pathname.match(/^\/api\/user-stories\/([^/]+)$/);
	if (req.method === 'PATCH' && storyUpdateMatch) {
		const id = Number(storyUpdateMatch[1]);
		if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
			return jsonResponse({ error: 'Invalid user story ID' }, 400);
		}

		let body: { role?: unknown; feature?: unknown; benefit?: unknown };
		try {
			body = (await req.json()) as { role?: unknown; feature?: unknown; benefit?: unknown };
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400);
		}

		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return jsonResponse({ error: 'Request body must be an object' }, 400);
		}

		const hasRole = 'role' in body;
		const hasFeature = 'feature' in body;
		const hasBenefit = 'benefit' in body;

		if (!hasRole && !hasFeature && !hasBenefit) {
			return jsonResponse(
				{ error: 'At least one field (role, feature, benefit) must be provided for update' },
				400
			);
		}

		const updateData: {
			role?: string;
			feature?: string;
			benefit?: string;
			status?: (typeof userStoryStatusEnum.enumValues)[number];
			updatedAt: Date;
		} = {
			updatedAt: new Date()
		};

		if (hasRole) {
			if (typeof body.role !== 'string' || body.role.trim() === '') {
				return jsonResponse({ error: 'role must be a non-empty string' }, 400);
			}
			updateData.role = body.role.trim();
		}

		if (hasFeature) {
			if (typeof body.feature !== 'string' || body.feature.trim() === '') {
				return jsonResponse({ error: 'feature must be a non-empty string' }, 400);
			}
			updateData.feature = body.feature.trim();
		}

		if (hasBenefit) {
			if (typeof body.benefit !== 'string' || body.benefit.trim() === '') {
				return jsonResponse({ error: 'benefit must be a non-empty string' }, 400);
			}
			updateData.benefit = body.benefit.trim();
		}

		try {
			const [existingStory] = await db
				.select()
				.from(userStories)
				.where(eq(userStories.id, id));

			if (!existingStory) {
				return jsonResponse({ error: 'User story not found' }, 404);
			}

			// If current story is 'draft', editing content automatically flags it as 'edited'
			if (existingStory.status === 'draft') {
				updateData.status = 'edited';
			}

			const [updatedStory] = await db
				.update(userStories)
				.set(updateData)
				.where(eq(userStories.id, id))
				.returning();

			return jsonResponse(updatedStory, 200);
		} catch (error) {
			console.error(`Database error on PATCH /api/user-stories/${id}:`, error);
			return jsonResponse({ error: 'Failed to update user story' }, 500);
		}
	}

	// PUT /api/user-stories/:id/acceptance-criteria
	const criteriaUpdateMatch = pathname.match(/^\/api\/user-stories\/([^/]+)\/acceptance-criteria$/);
	if (req.method === 'PUT' && criteriaUpdateMatch) {
		const id = Number(criteriaUpdateMatch[1]);
		if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
			return jsonResponse({ error: 'Invalid user story ID' }, 400);
		}

		let body: { acceptance_criteria?: unknown };
		try {
			body = (await req.json()) as { acceptance_criteria?: unknown };
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400);
		}

		if (!body || !Array.isArray(body.acceptance_criteria)) {
			return jsonResponse(
				{ error: 'acceptance_criteria must be an array of criteria items' },
				400
			);
		}

		const rawCriteria = body.acceptance_criteria;
		if (rawCriteria.length === 0) {
			return jsonResponse(
				{ error: 'acceptance_criteria array cannot be empty (minimum 1 criteria required)' },
				400
			);
		}

		const validatedCriteria: Array<{
			givenText: string;
			whenText: string;
			thenText: string;
			sortOrder: number;
		}> = [];

		for (let i = 0; i < rawCriteria.length; i++) {
			const item = rawCriteria[i];
			const itemIndex = i + 1;

			if (!item || typeof item !== 'object' || Array.isArray(item)) {
				return jsonResponse(
					{ error: `acceptance_criteria item at index ${itemIndex} must be an object` },
					400
				);
			}

			const given = (item as any).given ?? (item as any).given_text;
			const when = (item as any).when ?? (item as any).when_text;
			const then = (item as any).then ?? (item as any).then_text;
			const explicitSortOrder = (item as any).sort_order;

			if (typeof given !== 'string' || given.trim() === '') {
				return jsonResponse(
					{ error: `Item ${itemIndex}: 'given' (or 'given_text') is required and cannot be empty` },
					400
				);
			}

			if (typeof when !== 'string' || when.trim() === '') {
				return jsonResponse(
					{ error: `Item ${itemIndex}: 'when' (or 'when_text') is required and cannot be empty` },
					400
				);
			}

			if (typeof then !== 'string' || then.trim() === '') {
				return jsonResponse(
					{ error: `Item ${itemIndex}: 'then' (or 'then_text') is required and cannot be empty` },
					400
				);
			}

			let sortOrder = itemIndex;
			if (explicitSortOrder !== undefined && explicitSortOrder !== null) {
				const parsedSort = Number(explicitSortOrder);
				if (Number.isInteger(parsedSort) && parsedSort > 0) {
					sortOrder = parsedSort;
				}
			}

			validatedCriteria.push({
				givenText: given.trim(),
				whenText: when.trim(),
				thenText: then.trim(),
				sortOrder
			});
		}

		try {
			const [existingStory] = await db
				.select()
				.from(userStories)
				.where(eq(userStories.id, id));

			if (!existingStory) {
				return jsonResponse({ error: 'User story not found' }, 404);
			}

			// Atomic replacement within db.transaction
			const insertedCriteria = await db.transaction(async (tx) => {
				await tx
					.delete(acceptanceCriteria)
					.where(eq(acceptanceCriteria.userStoryId, id));

				const inserted = await tx
					.insert(acceptanceCriteria)
					.values(
						validatedCriteria.map((c) => ({
							userStoryId: id,
							givenText: c.givenText,
							whenText: c.whenText,
							thenText: c.thenText,
							sortOrder: c.sortOrder
						}))
					)
					.returning();

				// Update user story status to 'edited' if it was 'draft', and update its timestamp
				const storyUpdate: { updatedAt: Date; status?: (typeof userStoryStatusEnum.enumValues)[number] } = {
					updatedAt: new Date()
				};
				if (existingStory.status === 'draft') {
					storyUpdate.status = 'edited';
				}

				await tx
					.update(userStories)
					.set(storyUpdate)
					.where(eq(userStories.id, id));

				return inserted;
			});

			return jsonResponse(
				{
					user_story_id: id,
					acceptance_criteria: insertedCriteria.sort(
						(a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
					)
				},
				200
			);
		} catch (error) {
			console.error(`Database error on PUT /api/user-stories/${id}/acceptance-criteria:`, error);
			return jsonResponse({ error: 'Failed to update acceptance criteria' }, 500);
		}
	}

	return jsonResponse({ error: 'Not Found' }, 404);
}

// Start Bun server only if this file is executed directly (not imported by test runner)
if (import.meta.main) {
	Bun.serve({
		port,
		fetch: handleRequest
	});
	console.log(`Server running at http://localhost:${port}`);
}
