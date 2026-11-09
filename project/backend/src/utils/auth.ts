import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'kapsel_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (604,800s)

/**
 * Pre-computed constant dummy Argon2id hash (m=65536, t=2, p=1).
 * Used during login when an email does not exist to equalize verification time
 * and eliminate timing-based account enumeration.
 */
export const DUMMY_ARGON2ID_HASH =
	'$argon2id$v=19$m=65536,t=2,p=1$HOlaHslIC2BfS4WV52IXVfM2qZubcAxDkRcaksGh5As$/MFZSbScIv5ELnuoPOWzHFtpSOYqa/8E5MdRgFYgjJI';

/**
 * Type signature for password verifier function (supports dependency injection).
 */
export type PasswordVerifier = (password: string, hash: string) => Promise<boolean>;

/**
 * Hash a password using Bun's native Argon2id implementation.
 */
export async function hashPassword(password: string): Promise<string> {
	return await Bun.password.hash(password, {
		algorithm: 'argon2id',
		memoryCost: 65536,
		timeCost: 2
	});
}

/**
 * Default production password verifier using Bun's native Argon2id API.
 */
export const defaultPasswordVerifier: PasswordVerifier = async (password: string, hash: string): Promise<boolean> => {
	return await Bun.password.verify(password, hash);
};

/**
 * Hash a raw token with SHA-256 (for session tokens & CSRF hashes).
 */
export function sha256Hex(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure 32-byte raw session token (hex string = 64 chars).
 */
export function generateRawSessionToken(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Validate email format.
 */
export function isValidEmail(email: unknown): email is string {
	if (typeof email !== 'string') return false;
	const trimmed = email.trim();
	if (trimmed.length === 0 || trimmed.length > 255) return false;
	// Standard email pattern
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Validate password requirements: at least 8 characters, non-empty.
 */
export function isValidPassword(password: unknown): password is string {
	if (typeof password !== 'string') return false;
	return password.length >= 8 && password.length <= 128;
}

/**
 * Parse an HTTP Cookie header string into key-value pairs.
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
	const cookies: Record<string, string> = {};
	if (!cookieHeader) return cookies;

	const parts = cookieHeader.split(';');
	for (const part of parts) {
		const [rawKey, ...rawValParts] = part.trim().split('=');
		if (rawKey) {
			cookies[rawKey.trim()] = decodeURIComponent(rawValParts.join('=').trim());
		}
	}
	return cookies;
}

/**
 * Build a Set-Cookie header string for the session cookie.
 */
export function buildSessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
	const isProd = Bun.env.NODE_ENV === 'production';
	const parts = [
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
		`Max-Age=${maxAge}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax'
	];
	if (isProd) {
		parts.push('Secure');
	}
	return parts.join('; ');
}

/**
 * Build a Set-Cookie header string to clear/expire the session cookie immediately.
 */
export function buildClearSessionCookie(): string {
	const isProd = Bun.env.NODE_ENV === 'production';
	const parts = [
		`${SESSION_COOKIE_NAME}=`,
		'Max-Age=0',
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
	];
	if (isProd) {
		parts.push('Secure');
	}
	return parts.join('; ');
}

