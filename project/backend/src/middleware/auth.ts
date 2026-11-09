import { parseCookies, SESSION_COOKIE_NAME } from '../utils/auth';
import { validateSession, type SessionContext } from '../services/auth';

export type { SessionContext };

export type AuthResult =
	| { success: true; context: SessionContext }
	| { success: false; status: 401; error: string };

export type RoleCheckResult =
	| { success: true }
	| { success: false; status: 403; error: string };

/**
 * Authenticate an incoming request.
 * Reads the session cookie, looks up and validates the session in PostgreSQL,
 * and ensures the user account is active.
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
	const cookieHeader = req.headers.get('cookie');
	const cookies = parseCookies(cookieHeader);
	const rawToken = cookies[SESSION_COOKIE_NAME];

	if (!rawToken) {
		return { success: false, status: 401, error: 'Authentication required: missing session cookie' };
	}

	const context = await validateSession(rawToken);
	if (!context) {
		return { success: false, status: 401, error: 'Authentication required: invalid, expired, or inactive session' };
	}

	return { success: true, context };
}

/**
 * Enforce a valid authenticated session.
 * Returns the validated SessionContext or a structured error with status 401.
 *
 * Usage in route handlers:
 *   const auth = await requireAuth(req);
 *   if (!auth.success) return jsonResponse({ error: auth.error }, auth.status);
 *   const { context } = auth;
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
	return authenticateRequest(req);
}

/**
 * Role-based authorization check.
 * Must be called after successful authentication with the validated SessionContext.
 * The role is derived from the database-backed session context, never from client input.
 *
 * Usage in route handlers:
 *   const roleCheck = requireRole(context, 'admin');
 *   if (!roleCheck.success) return jsonResponse({ error: roleCheck.error }, roleCheck.status);
 */
export function requireRole(context: SessionContext, requiredRole: 'admin'): RoleCheckResult {
	if (context.user.role !== requiredRole) {
		return { success: false, status: 403, error: 'Forbidden: insufficient privileges' };
	}
	return { success: true };
}
