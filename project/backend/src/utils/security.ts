/**
 * Origin validation and Rate limiting utilities for authentication endpoints.
 */

/**
 * Parse and normalize the CORS_ALLOWLIST environment variable into an array of allowed origins.
 */
export function getCorsAllowlist(): string[] {
	const raw = Bun.env.CORS_ALLOWLIST || 'http://localhost:5173,http://localhost:3000';
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Validate that a request Origin header matches the explicit allowlist.
 * Returns true if valid, false otherwise.
 * Missing Origin returns false by default for browser-based endpoints.
 */
export function isOriginAllowed(origin: string | null): boolean {
	if (!origin) return false;
	const allowlist = getCorsAllowlist();
	// Exact matching, never substring
	return allowlist.includes(origin);
}

/**
 * Simple in-memory rate limiter for single-process development.
 * Note: In production or clustered environments, this must be replaced with a distributed store (e.g. Redis).
 */
interface RateLimitRecord {
	count: number;
	resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
	maxRequests: number; // e.g. 10
	windowMs: number;    // e.g. 60000 (1 minute)
}

/**
 * Check if a client key (e.g. IP or IP+route) has exceeded the rate limit.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
 */
export function checkRateLimit(
	key: string,
	options: RateLimitOptions = { maxRequests: 20, windowMs: 60 * 1000 }
): { allowed: boolean; retryAfterSeconds: number } {
	const now = Date.now();
	const existing = rateLimitStore.get(key);

	if (!existing || now > existing.resetAt) {
		rateLimitStore.set(key, {
			count: 1,
			resetAt: now + options.windowMs
		});
		return { allowed: true, retryAfterSeconds: 0 };
	}

	if (existing.count >= options.maxRequests) {
		const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
		return { allowed: false, retryAfterSeconds };
	}

	existing.count += 1;
	return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Helper to reset rate limits (primarily used in tests).
 */
export function resetRateLimits(): void {
	rateLimitStore.clear();
}

