import { eq, desc } from 'drizzle-orm';
import { db } from './db';
import {
	transcripts,
	userStories,
	acceptanceCriteria,
	userStoryStatusEnum,
	extractionRuns,
	extractionAttempts,
	users
} from './db/schema';
import { processTranscript } from './services/extractor';
import {
	hashPassword,
	defaultPasswordVerifier,
	type PasswordVerifier,
	isValidEmail,
	isValidPassword,
	buildSessionCookie,
	buildClearSessionCookie,
	parseCookies,
	SESSION_COOKIE_NAME,
	DUMMY_ARGON2ID_HASH
} from './utils/auth';
import { createSession, revokeSessionByRawToken } from './services/auth';
import { authenticateRequest } from './middleware/auth';
import { isOriginAllowed, checkRateLimit } from './utils/security';

const port = Number(Bun.env.PORT) || 3000;

export const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
	'Access-Control-Allow-Credentials': 'true'
};

export function jsonResponse(
	data: unknown,
	status = 200,
	customHeaders?: Record<string, string>
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders,
			...(customHeaders || {})
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

export interface RequestContextOptions {
	passwordVerifier?: PasswordVerifier;
}

export async function handleRequest(req: Request, options: RequestContextOptions = {}): Promise<Response> {
	const passwordVerifier = options.passwordVerifier || defaultPasswordVerifier;
	const url = new URL(req.url);
	const { pathname } = url;

	// Handle CORS Preflight
	if (req.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: corsHeaders
		});
	}

	// -------------------------------------------------------------
	// AUTHENTICATION ROUTES (Phase 2)
	// -------------------------------------------------------------

	// POST /api/auth/register
	if (req.method === 'POST' && pathname === '/api/auth/register') {
		const origin = req.headers.get('origin');
		if (!isOriginAllowed(origin)) {
			return jsonResponse({ error: 'Forbidden: origin not allowed or missing' }, 403);
		}

		// Rate limiting: max 10 registrations per minute per IP
		const clientIp = req.headers.get('x-forwarded-for') || 'local';
		const rateCheck = checkRateLimit(`register:${clientIp}`, { maxRequests: 10, windowMs: 60 * 1000 });
		if (!rateCheck.allowed) {
			return jsonResponse({ error: 'Too many registration requests. Please try again later.' }, 429);
		}

		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400);
		}

		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return jsonResponse({ error: 'Request body must be an object' }, 400);
		}

		// Strict field validation: allow only 'email' and 'password'
		const allowedKeys = new Set(['email', 'password']);
		const bodyKeys = Object.keys(body);
		const unknownKeys = bodyKeys.filter((k) => !allowedKeys.has(k));
		if (unknownKeys.length > 0) {
			return jsonResponse(
				{ error: `Prohibited or unknown field(s) in registration request: ${unknownKeys.join(', ')}` },
				400
			);
		}

		const { email, password } = body;
		if (!isValidEmail(email)) {
			return jsonResponse({ error: 'Invalid email address' }, 400);
		}

		if (!isValidPassword(password)) {
			return jsonResponse({ error: 'Password must be between 8 and 128 characters' }, 400);
		}

		// Check duplicate email
		const existingUser = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email.trim().toLowerCase()))
			.limit(1);

		if (existingUser.length > 0) {
			return jsonResponse({ error: 'An account with this email already exists' }, 409);
		}

		try {
			const passwordHash = await hashPassword(password);
			const [newUser] = await db
				.insert(users)
				.values({
					email: email.trim().toLowerCase(),
					passwordHash,
					role: 'user', // Always assigned server-side
					isActive: true
				})
				.returning({
					id: users.id,
					email: users.email,
					role: users.role,
					isActive: users.isActive,
					createdAt: users.createdAt
				});

			return jsonResponse(newUser, 201);
		} catch (error) {
			console.error('Registration database error:', error);
			return jsonResponse({ error: 'Failed to register account' }, 500);
		}
	}

	// POST /api/auth/login
	if (req.method === 'POST' && pathname === '/api/auth/login') {
		const origin = req.headers.get('origin');
		if (!isOriginAllowed(origin)) {
			return jsonResponse({ error: 'Forbidden: origin not allowed or missing' }, 403);
		}

		// Rate limiting: max 15 login attempts per minute per IP
		const clientIp = req.headers.get('x-forwarded-for') || 'local';
		const rateCheck = checkRateLimit(`login:${clientIp}`, { maxRequests: 15, windowMs: 60 * 1000 });
		if (!rateCheck.allowed) {
			return jsonResponse({ error: 'Too many login attempts. Please try again later.' }, 429);
		}

		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			return jsonResponse({ error: 'Invalid JSON body' }, 400);
		}

		const { email, password } = body;
		if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
			return jsonResponse({ error: 'Email and password are required' }, 400);
		}

		// Look up user
		const matchingUsers = await db
			.select()
			.from(users)
			.where(eq(users.email, email.trim().toLowerCase()))
			.limit(1);

		// If user does not exist, verify against pre-computed dummy hash to equalize timing
		if (matchingUsers.length === 0) {
			await passwordVerifier(password, DUMMY_ARGON2ID_HASH);
			return jsonResponse({ error: 'Invalid email or password' }, 401);
		}

		const foundUser = matchingUsers[0];

		// Always verify password against stored hash first
		const isPasswordValid = await passwordVerifier(password, foundUser.passwordHash);

		// Reject if password is invalid OR if account is inactive
		// Returning the identical generic error to prevent enumeration of account status
		if (!isPasswordValid || !foundUser.isActive) {
			return jsonResponse({ error: 'Invalid email or password' }, 401);
		}

		try {
			// Create session and set cookie
			const { rawToken } = await createSession(foundUser.id);
			const cookieHeader = buildSessionCookie(rawToken);

			return jsonResponse(
				{
					user: {
						id: foundUser.id,
						email: foundUser.email,
						role: foundUser.role,
						isActive: foundUser.isActive,
						createdAt: foundUser.createdAt
					}
				},
				200,
				{ 'Set-Cookie': cookieHeader }
			);
		} catch (error) {
			console.error('Login session creation error:', error);
			return jsonResponse({ error: 'Failed to process login' }, 500);
		}
	}

	// POST /api/auth/logout
	if (req.method === 'POST' && pathname === '/api/auth/logout') {
		const cookieHeader = req.headers.get('cookie');
		const cookies = parseCookies(cookieHeader);
		const rawToken = cookies[SESSION_COOKIE_NAME];

		if (rawToken) {
			await revokeSessionByRawToken(rawToken);
		}

		const clearCookie = buildClearSessionCookie();
		return jsonResponse({ message: 'Logged out successfully' }, 200, {
			'Set-Cookie': clearCookie
		});
	}

	// GET /api/auth/me
	if (req.method === 'GET' && pathname === '/api/auth/me') {
		const auth = await authenticateRequest(req);
		if (!auth.success) {
			return jsonResponse({ error: auth.error }, auth.status);
		}

		return jsonResponse({ user: auth.context.user }, 200);
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
			if (error?.statusCode === 409 || error?.message?.includes('currently being processed')) {
				return jsonResponse({ error: error.message }, 409);
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
					},
					extractionRuns: {
						orderBy: [desc(extractionRuns.runNumber)],
						with: {
							attempts: {
								orderBy: (attempts, { asc }) => [asc(attempts.attemptNumber)]
							}
						}
					}
				}
			});

			if (!transcript) {
				return jsonResponse({ error: 'Transcript not found' }, 404);
			}

			// Compute lifetime token usage & cost across all historical runs
			let lifetimePromptTokens: number | null = 0;
			let lifetimeCompletionTokens: number | null = 0;
			let lifetimeTotalTokens: number | null = 0;
			let lifetimeCostUsd: number | null = 0;

			const runs = transcript.extractionRuns || [];
			for (const r of runs) {
				for (const a of r.attempts || []) {
					if (a.promptTokens !== null) lifetimePromptTokens = (lifetimePromptTokens ?? 0) + a.promptTokens;
					if (a.completionTokens !== null) lifetimeCompletionTokens = (lifetimeCompletionTokens ?? 0) + a.completionTokens;
					if (a.totalTokens !== null) lifetimeTotalTokens = (lifetimeTotalTokens ?? 0) + a.totalTokens;

					if (a.estimatedCostUsd !== null && lifetimeCostUsd !== null) {
						lifetimeCostUsd += a.estimatedCostUsd;
					} else if (a.status === 'success' || a.status === 'parse_error') {
						lifetimeCostUsd = null;
					}
				}
			}

			// Latest run stats
			const latestRun = runs[0] || null;
			let latestPromptTokens: number | null = 0;
			let latestCompletionTokens: number | null = 0;
			let latestTotalTokens: number | null = 0;
			let latestCostUsd: number | null = 0;

			if (latestRun) {
				for (const a of latestRun.attempts || []) {
					if (a.promptTokens !== null) latestPromptTokens = (latestPromptTokens ?? 0) + a.promptTokens;
					if (a.completionTokens !== null) latestCompletionTokens = (latestCompletionTokens ?? 0) + a.completionTokens;
					if (a.totalTokens !== null) latestTotalTokens = (latestTotalTokens ?? 0) + a.totalTokens;

					if (a.estimatedCostUsd !== null && latestCostUsd !== null) {
						latestCostUsd += a.estimatedCostUsd;
					} else if (a.status === 'success' || a.status === 'parse_error') {
						latestCostUsd = null;
					}
				}
			} else {
				latestPromptTokens = null;
				latestCompletionTokens = null;
				latestTotalTokens = null;
				latestCostUsd = null;
			}

			return jsonResponse(
				{
					...transcript,
					usage_summary: {
						latest_run: latestRun
							? {
									run_id: latestRun.id,
									run_number: latestRun.runNumber,
									status: latestRun.status,
									prompt_tokens: latestPromptTokens,
									completion_tokens: latestCompletionTokens,
									total_tokens: latestTotalTokens,
									estimated_cost_usd: latestCostUsd !== null ? Number(latestCostUsd.toFixed(6)) : null
							  }
							: null,
						lifetime: {
							total_runs: runs.length,
							prompt_tokens: lifetimePromptTokens,
							completion_tokens: lifetimeCompletionTokens,
							total_tokens: lifetimeTotalTokens,
							estimated_cost_usd: lifetimeCostUsd !== null ? Number(lifetimeCostUsd.toFixed(6)) : null
						}
					}
				},
				200
			);
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
