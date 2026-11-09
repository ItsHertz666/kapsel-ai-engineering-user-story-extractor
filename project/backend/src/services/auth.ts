import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import {
	generateRawSessionToken,
	sha256Hex,
	SESSION_TTL_SECONDS
} from '../utils/auth';

export interface AuthenticatedUser {
	id: string;
	email: string;
	role: 'user' | 'admin';
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface SessionContext {
	sessionId: string;
	user: AuthenticatedUser;
}

/**
 * Create a new session for a user.
 * Returns the raw token (to be sent via HttpOnly cookie) and the created session ID.
 */
export async function createSession(
	userId: string,
	ttlSeconds = SESSION_TTL_SECONDS
): Promise<{ rawToken: string; sessionId: string; expiresAt: Date }> {
	const rawToken = generateRawSessionToken();
	const sessionTokenHash = sha256Hex(rawToken);
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

	const [created] = await db
		.insert(sessions)
		.values({
			userId,
			sessionTokenHash,
			csrfTokenHash: null, // Populated deterministically in Phase 5
			createdAt: now,
			expiresAt,
			lastActivityAt: now
		})
		.returning({ id: sessions.id, expiresAt: sessions.expiresAt });

	return {
		rawToken,
		sessionId: created.id,
		expiresAt: created.expiresAt
	};
}

/**
 * Validate a raw session token.
 * Hashes the token, looks up the active session in PostgreSQL, verifies user existence and active status.
 * Updates last_activity_at when valid.
 */
export async function validateSession(rawToken: string): Promise<SessionContext | null> {
	if (!rawToken || typeof rawToken !== 'string') return null;

	const tokenHash = sha256Hex(rawToken);
	const now = new Date();

	// Find non-expired session matching the hash
	const matchingSessions = await db
		.select({
			sessionId: sessions.id,
			userId: sessions.userId,
			expiresAt: sessions.expiresAt,
			user: {
				id: users.id,
				email: users.email,
				role: users.role,
				isActive: users.isActive,
				createdAt: users.createdAt,
				updatedAt: users.updatedAt
			}
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(
			and(
				eq(sessions.sessionTokenHash, tokenHash),
				gt(sessions.expiresAt, now)
			)
		)
		.limit(1);

	if (matchingSessions.length === 0) {
		return null;
	}

	const found = matchingSessions[0];

	// Verify account is active directly from DB
	if (!found.user.isActive) {
		return null;
	}

	// Update last_activity_at (best-effort, non-blocking)
	await db
		.update(sessions)
		.set({ lastActivityAt: new Date() })
		.where(eq(sessions.id, found.sessionId))
		.catch((err) => {
			console.error('Failed to update session last_activity_at:', err);
		});

	return {
		sessionId: found.sessionId,
		user: {
			id: found.user.id,
			email: found.user.email,
			role: found.user.role,
			isActive: found.user.isActive,
			createdAt: found.user.createdAt,
			updatedAt: found.user.updatedAt
		}
	};
}

/**
 * Revoke (delete) a session by its raw token.
 */
export async function revokeSessionByRawToken(rawToken: string): Promise<boolean> {
	if (!rawToken) return false;
	const tokenHash = sha256Hex(rawToken);

	const deleted = await db
		.delete(sessions)
		.where(eq(sessions.sessionTokenHash, tokenHash))
		.returning({ id: sessions.id });

	return deleted.length > 0;
}

/**
 * Revoke all sessions for a specific user ID.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
	const deleted = await db
		.delete(sessions)
		.where(eq(sessions.userId, userId))
		.returning({ id: sessions.id });

	return deleted.length;
}

