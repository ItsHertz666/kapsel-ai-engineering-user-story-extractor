import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../src/db';
import { users, sessions, transcripts } from '../src/db/schema';
import { handleRequest } from '../src/index';
import { hashPassword, sha256Hex, buildSessionCookie, SESSION_COOKIE_NAME, DUMMY_ARGON2ID_HASH, defaultPasswordVerifier } from '../src/utils/auth';
import { createSession } from '../src/services/auth';
import { resetRateLimits } from '../src/utils/security';
import { bootstrapAdmin } from '../scripts/bootstrap-admin';
import { eq } from 'drizzle-orm';

describe('Phase 2 — Authentication Core', () => {
	const ALLOWED_ORIGIN = 'http://localhost:5173';
	const DISALLOWED_ORIGIN = 'http://malicious-attacker.com';

	beforeEach(() => {
		resetRateLimits();
	});

	beforeAll(async () => {
		// Clean test sessions & users before auth suite runs
		await db.delete(sessions);
		await db.delete(transcripts);
		await db.delete(users);
	});

	afterAll(async () => {
		// Clean up test sessions & users created during test suite
		await db.delete(sessions);
		await db.delete(transcripts);
		await db.delete(users);
	});

	describe('User Registration (POST /api/auth/register)', () => {
		it('should create a new user with role = user, is_active = true, and Argon2id hash', async () => {
			const email = 'normaluser@example.com';
			const password = 'StrongPassword123!';

			const req = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email, password })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(201);

			const data = (await res.json()) as any;
			expect(data.id).toBeDefined();
			expect(data.email).toBe(email);
			expect(data.role).toBe('user');
			expect(data.isActive).toBe(true);
			expect(data.passwordHash).toBeUndefined(); // Never returned in response

			// Verify DB record directly
			const [dbUser] = await db.select().from(users).where(eq(users.email, email));
			expect(dbUser).toBeDefined();
			expect(dbUser.role).toBe('user');
			expect(dbUser.isActive).toBe(true);
			expect(dbUser.passwordHash.startsWith('$argon2id$')).toBe(true);
			expect(dbUser.passwordHash).not.toContain(password); // Plaintext never stored
		});

		it('should reject registration specifying role = admin with HTTP 400 and not create the user', async () => {
			const email = 'attacker-admin@example.com';
			const password = 'HackerPassword123!';

			const req = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email, password, role: 'admin' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);

			const data = (await res.json()) as any;
			expect(data.error).toContain('Prohibited or unknown field');

			// Assert no user account was created in the database
			const [dbUser] = await db.select().from(users).where(eq(users.email, email));
			expect(dbUser).toBeUndefined();
		});

		it('should reject registration containing role = user, is_active, id, or arbitrary unknown fields with HTTP 400', async () => {
			const testCases = [
				{ payload: { email: 't1@example.com', password: 'ValidPass123!', role: 'user' }, email: 't1@example.com' },
				{ payload: { email: 't2@example.com', password: 'ValidPass123!', is_active: false }, email: 't2@example.com' },
				{ payload: { email: 't3@example.com', password: 'ValidPass123!', id: '00000000-0000-0000-0000-000000000000' }, email: 't3@example.com' },
				{ payload: { email: 't4@example.com', password: 'ValidPass123!', hacker_data: 'exploit' }, email: 't4@example.com' }
			];

			for (const tc of testCases) {
				const req = new Request('http://localhost:3000/api/auth/register', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Origin: ALLOWED_ORIGIN
					},
					body: JSON.stringify(tc.payload)
				});

				const res = await handleRequest(req);
				expect(res.status).toBe(400);

				const data = (await res.json()) as any;
				expect(data.error).toContain('Prohibited or unknown field');

				// Ensure no user was created
				const [dbUser] = await db.select().from(users).where(eq(users.email, tc.email));
				expect(dbUser).toBeUndefined();
			}
		});

		it('should reject duplicate email with HTTP 409', async () => {
			const email = 'normaluser@example.com'; // Already registered above
			const password = 'AnotherPassword123!';

			const req = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email, password })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(409);
		});

		it('should reject registration with invalid email or short password with HTTP 400', async () => {
			const req1 = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
				body: JSON.stringify({ email: 'not-an-email', password: 'ValidPass123!' })
			});
			const res1 = await handleRequest(req1);
			expect(res1.status).toBe(400);

			const req2 = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
				body: JSON.stringify({ email: 'valid@example.com', password: 'short' })
			});
			const res2 = await handleRequest(req2);
			expect(res2.status).toBe(400);
		});

		it('should reject registration when Origin is missing or disallowed with HTTP 403', async () => {
			// Missing origin
			const reqNoOrigin = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'test@example.com', password: 'Password123!' })
			});
			const resNoOrigin = await handleRequest(reqNoOrigin);
			expect(resNoOrigin.status).toBe(403);

			// Disallowed origin
			const reqBadOrigin = new Request('http://localhost:3000/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: DISALLOWED_ORIGIN },
				body: JSON.stringify({ email: 'test@example.com', password: 'Password123!' })
			});
			const resBadOrigin = await handleRequest(reqBadOrigin);
			expect(resBadOrigin.status).toBe(403);
		});
	});

	describe('User Login (POST /api/auth/login)', () => {
		const loginEmail = 'loginuser@example.com';
		const loginPass = 'LoginPassword123!';
		let userId: string;

		beforeAll(async () => {
			const passwordHash = await hashPassword(loginPass);
			const [u] = await db
				.insert(users)
				.values({
					email: loginEmail,
					passwordHash,
					role: 'user',
					isActive: true
				})
				.returning({ id: users.id });
			userId = u.id;
		});

		it('should successfully log in with valid credentials, returning 200 and setting HttpOnly cookie', async () => {
			const req = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email: loginEmail, password: loginPass })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const cookie = res.headers.get('set-cookie');
			expect(cookie).toBeDefined();
			expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
			expect(cookie).toContain('HttpOnly');
			expect(cookie).toContain('SameSite=Lax');
			expect(cookie).toContain('Path=/');
			expect(cookie).toContain('Max-Age=604800');

			const data = (await res.json()) as any;
			expect(data.user.id).toBe(userId);
			expect(data.user.email).toBe(loginEmail);
			expect(data.user.passwordHash).toBeUndefined();
			expect(data.rawToken).toBeUndefined(); // Raw session token never in JSON response

			// Verify session in database: only SHA-256 hash is stored
			const match = cookie!.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
			const rawToken = decodeURIComponent(match![1]);
			const tokenHash = sha256Hex(rawToken);

			const [dbSession] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.sessionTokenHash, tokenHash));
			expect(dbSession).toBeDefined();
			expect(dbSession.userId).toBe(userId);
			expect(dbSession.sessionTokenHash).toBe(tokenHash);
			expect(dbSession.sessionTokenHash).not.toBe(rawToken); // Raw token is NOT stored in DB
		});

		it('should reject invalid password with generic 401 error and execute real password verification path', async () => {
			const verifierInvocations: { isDummy: boolean; count: number }[] = [];
			const spyVerifier = async (password: string, hash: string) => {
				verifierInvocations.push({ isDummy: hash === DUMMY_ARGON2ID_HASH, count: verifierInvocations.length + 1 });
				return await defaultPasswordVerifier(password, hash);
			};

			const req = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email: loginEmail, password: 'WrongPassword!' })
			});

			const res = await handleRequest(req, { passwordVerifier: spyVerifier });
			expect(res.status).toBe(401);
			const data = (await res.json()) as any;
			expect(data.error).toBe('Invalid email or password');

			// Assert exactly 1 verification operation was executed against the real hash
			expect(verifierInvocations.length).toBe(1);
			expect(verifierInvocations[0].isDummy).toBe(false);
		});

		it('should reject unknown email with generic 401 error and execute dummy verification path (preventing timing attacks)', async () => {
			const verifierInvocations: { isDummy: boolean; count: number }[] = [];
			const spyVerifier = async (password: string, hash: string) => {
				verifierInvocations.push({ isDummy: hash === DUMMY_ARGON2ID_HASH, count: verifierInvocations.length + 1 });
				return await defaultPasswordVerifier(password, hash);
			};

			const req = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email: 'nonexistent@example.com', password: 'SomePassword123!' })
			});

			const res = await handleRequest(req, { passwordVerifier: spyVerifier });
			expect(res.status).toBe(401);
			const data = (await res.json()) as any;
			expect(data.error).toBe('Invalid email or password');

			// Assert exactly 1 verification operation was executed against the dummy hash
			expect(verifierInvocations.length).toBe(1);
			expect(verifierInvocations[0].isDummy).toBe(true);
		});

		it('should reject inactive account with generic 401 error while still performing password verification against real stored hash', async () => {
			const verifierInvocations: { isDummy: boolean; count: number }[] = [];
			const spyVerifier = async (password: string, hash: string) => {
				verifierInvocations.push({ isDummy: hash === DUMMY_ARGON2ID_HASH, count: verifierInvocations.length + 1 });
				return await defaultPasswordVerifier(password, hash);
			};

			// Create inactive user
			const inactiveEmail = 'inactive@example.com';
			const passwordHash = await hashPassword(loginPass);
			await db.insert(users).values({
				email: inactiveEmail,
				passwordHash,
				role: 'user',
				isActive: false
			});

			const req = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: ALLOWED_ORIGIN
				},
				body: JSON.stringify({ email: inactiveEmail, password: loginPass })
			});

			const res = await handleRequest(req, { passwordVerifier: spyVerifier });
			expect(res.status).toBe(401);
			const data = (await res.json()) as any;
			expect(data.error).toBe('Invalid email or password');

			// Assert exactly 1 verification operation was executed against the real hash
			expect(verifierInvocations.length).toBe(1);
			expect(verifierInvocations[0].isDummy).toBe(false);
		});

		it('should ensure concurrent login requests with isolated verifier spies cannot interfere with each other', async () => {
			const invocationsA: { isDummy: boolean }[] = [];
			const spyA = async (password: string, hash: string) => {
				invocationsA.push({ isDummy: hash === DUMMY_ARGON2ID_HASH });
				return await defaultPasswordVerifier(password, hash);
			};

			const invocationsB: { isDummy: boolean }[] = [];
			const spyB = async (password: string, hash: string) => {
				invocationsB.push({ isDummy: hash === DUMMY_ARGON2ID_HASH });
				return await defaultPasswordVerifier(password, hash);
			};

			const reqUnknown = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
				body: JSON.stringify({ email: 'concurrent-unknown@example.com', password: 'SomePassword123!' })
			});

			const reqWrongPass = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
				body: JSON.stringify({ email: loginEmail, password: 'WrongPassword456!' })
			});

			// Execute both requests concurrently
			const [resA, resB] = await Promise.all([
				handleRequest(reqUnknown, { passwordVerifier: spyA }),
				handleRequest(reqWrongPass, { passwordVerifier: spyB })
			]);

			expect(resA.status).toBe(401);
			expect(resB.status).toBe(401);

			// Assert strict isolation: spyA observed exactly 1 dummy invocation, spyB observed exactly 1 real invocation
			expect(invocationsA.length).toBe(1);
			expect(invocationsA[0].isDummy).toBe(true);

			expect(invocationsB.length).toBe(1);
			expect(invocationsB[0].isDummy).toBe(false);
		});

		it('should reject login with disallowed or missing Origin with HTTP 403', async () => {
			const req = new Request('http://localhost:3000/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: DISALLOWED_ORIGIN
				},
				body: JSON.stringify({ email: loginEmail, password: loginPass })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(403);
		});
	});

	describe('User Logout (POST /api/auth/logout)', () => {
		it('should revoke the active session and clear cookie', async () => {
			// Create user & session
			const [u] = await db
				.insert(users)
				.values({
					email: 'logoutuser@example.com',
					passwordHash: await hashPassword('Password123!'),
					role: 'user',
					isActive: true
				})
				.returning({ id: users.id });

			const { rawToken } = await createSession(u.id);
			const tokenHash = sha256Hex(rawToken);

			// Verify session exists in DB before logout
			const [before] = await db.select().from(sessions).where(eq(sessions.sessionTokenHash, tokenHash));
			expect(before).toBeDefined();

			const req = new Request('http://localhost:3000/api/auth/logout', {
				method: 'POST',
				headers: {
					Cookie: buildSessionCookie(rawToken)
				}
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			// Cookie is cleared
			const setCookie = res.headers.get('set-cookie');
			expect(setCookie).toBeDefined();
			expect(setCookie).toContain('Max-Age=0');

			// Session is revoked in database
			const [after] = await db.select().from(sessions).where(eq(sessions.sessionTokenHash, tokenHash));
			expect(after).toBeUndefined();
		});

		it('should not affect other sessions when revoking one session', async () => {
			const [u] = await db
				.insert(users)
				.values({
					email: 'multisession@example.com',
					passwordHash: await hashPassword('Password123!'),
					role: 'user',
					isActive: true
				})
				.returning({ id: users.id });

			const s1 = await createSession(u.id);
			const s2 = await createSession(u.id);

			// Logout s1
			const req = new Request('http://localhost:3000/api/auth/logout', {
				method: 'POST',
				headers: { Cookie: buildSessionCookie(s1.rawToken) }
			});
			await handleRequest(req);

			// s1 is deleted, s2 remains active
			const [dbS1] = await db.select().from(sessions).where(eq(sessions.sessionTokenHash, sha256Hex(s1.rawToken)));
			const [dbS2] = await db.select().from(sessions).where(eq(sessions.sessionTokenHash, sha256Hex(s2.rawToken)));
			expect(dbS1).toBeUndefined();
			expect(dbS2).toBeDefined();
		});
	});

	describe('Authentication Middleware & Profile (GET /api/auth/me)', () => {
		let activeUser: any;
		let validRawToken: string;

		beforeAll(async () => {
			const [u] = await db
				.insert(users)
				.values({
					email: 'authtest@example.com',
					passwordHash: await hashPassword('AuthPassword123!'),
					role: 'user',
					isActive: true
				})
				.returning();
			activeUser = u;

			const s = await createSession(u.id);
			validRawToken = s.rawToken;
		});

		it('should return safe profile for a valid session', async () => {
			const req = new Request('http://localhost:3000/api/auth/me', {
				method: 'GET',
				headers: { Cookie: buildSessionCookie(validRawToken) }
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.user.id).toBe(activeUser.id);
			expect(data.user.email).toBe(activeUser.email);
			expect(data.user.role).toBe('user');
			expect(data.user.passwordHash).toBeUndefined();
		});

		it('should return 401 when session cookie is missing', async () => {
			const req = new Request('http://localhost:3000/api/auth/me', { method: 'GET' });
			const res = await handleRequest(req);
			expect(res.status).toBe(401);
		});

		it('should return 401 for an invalid / forged session token', async () => {
			const forgedToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
			const req = new Request('http://localhost:3000/api/auth/me', {
				method: 'GET',
				headers: { Cookie: buildSessionCookie(forgedToken) }
			});
			const res = await handleRequest(req);
			expect(res.status).toBe(401);
		});

		it('should return 401 for an expired session', async () => {
			// Create expired session (-1 hour)
			const { rawToken } = await createSession(activeUser.id, -3600);
			const req = new Request('http://localhost:3000/api/auth/me', {
				method: 'GET',
				headers: { Cookie: buildSessionCookie(rawToken) }
			});
			const res = await handleRequest(req);
			expect(res.status).toBe(401);
		});

		it('should return 401 when user account is deactivated even if session token is valid', async () => {
			const [inactiveUser] = await db
				.insert(users)
				.values({
					email: 'deactivated@example.com',
					passwordHash: await hashPassword('Password123!'),
					role: 'user',
					isActive: false
				})
				.returning();

			const { rawToken } = await createSession(inactiveUser.id);
			const req = new Request('http://localhost:3000/api/auth/me', {
				method: 'GET',
				headers: { Cookie: buildSessionCookie(rawToken) }
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(401);
		});
	});

	describe('Operator Admin Bootstrap CLI (scripts/bootstrap-admin.ts)', () => {
		it('should successfully create the first Admin account using Argon2id', async () => {
			const adminEmail = 'superadmin@kapsel.test';
			const adminPass = 'SecureAdminSecretPass123!';

			const result = await bootstrapAdmin(adminEmail, adminPass);
			expect(result.success).toBe(true);
			expect(result.adminId).toBeDefined();

			// Inspect DB
			const [dbAdmin] = await db.select().from(users).where(eq(users.email, adminEmail));
			expect(dbAdmin).toBeDefined();
			expect(dbAdmin.role).toBe('admin');
			expect(dbAdmin.isActive).toBe(true);
			expect(dbAdmin.passwordHash.startsWith('$argon2id$')).toBe(true);
		});

		it('should abort and reject duplicate email if email already exists', async () => {
			const adminEmail = 'superadmin@kapsel.test'; // Already created above
			const result = await bootstrapAdmin(adminEmail, 'AnotherPass123!');
			expect(result.success).toBe(false);
			expect(result.message).toContain('already exists');
		});

		it('should abort and prevent creating a second Admin account when an active Admin exists', async () => {
			const result = await bootstrapAdmin('secondadmin@kapsel.test', 'SomePassword123!');
			expect(result.success).toBe(false);
			expect(result.message).toContain('active Admin account already exists');
		});

		it('should prevent concurrent bootstrap attempts from creating multiple active first Admin accounts', async () => {
			// Clear existing records so we can test concurrent initial creation safely
			await db.delete(sessions);
			await db.delete(transcripts);
			await db.delete(users);

			// Run two concurrent bootstrap attempts targeting different emails simultaneously
			const [resA, resB] = await Promise.all([
				bootstrapAdmin('adminA@kapsel.test', 'AdminPasswordA123!'),
				bootstrapAdmin('adminB@kapsel.test', 'AdminPasswordB123!')
			]);

			// Exactly one must succeed, and the other must fail due to serialized advisory lock & post-lock re-check
			const successes = [resA, resB].filter((r) => r.success);
			const failures = [resA, resB].filter((r) => !r.success);

			expect(successes.length).toBe(1);
			expect(failures.length).toBe(1);
			expect(failures[0].message).toContain('active Admin account already exists');

			// Assert exactly one admin account exists in PostgreSQL
			const adminsInDb = await db.select().from(users).where(eq(users.role, 'admin'));
			expect(adminsInDb.length).toBe(1);
		});
	});
});

