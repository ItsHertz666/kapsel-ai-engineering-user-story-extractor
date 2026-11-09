import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import postgres from 'postgres';
import { db } from '../src/db';
import { transcripts, users, userStories, acceptanceCriteria, extractionRuns, extractionAttempts } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Phase 3 — Legacy Transcript Ownership Migration', () => {
	const env = fs.readFileSync('.env', 'utf8');
	const match = env.match(/DATABASE_URL=([^\r\n]+)/);
	if (!match) throw new Error('DATABASE_URL missing');
	const testDbUrl = match[1].substring(0, match[1].lastIndexOf('/') + 1) + 'kapsel_test';
	const rawSql = postgres(testDbUrl);

	let testAdminId: string;
	let testUserId: string;

	beforeAll(async () => {
		// Ensure an active admin exists in kapsel_test
		const existingAdmins = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
		if (existingAdmins.length > 0) {
			testAdminId = existingAdmins[0].id;
		} else {
			const [adm] = await db
				.insert(users)
				.values({
					email: 'migration_admin_test@kapsel.test',
					passwordHash: 'hash',
					role: 'admin',
					isActive: true
				})
				.returning({ id: users.id });
			testAdminId = adm.id;
		}

		// Create a standard user for ownership assertions
		const [u] = await db
			.insert(users)
			.values({
				email: 'standard_user_phase3@kapsel.test',
				passwordHash: 'hash',
				role: 'user',
				isActive: true
			})
			.returning({ id: users.id });
		testUserId = u.id;
	});

	afterAll(async () => {
		await rawSql.end();
	});

	it('should verify transcripts table schema in PostgreSQL enforces NOT NULL and Foreign Key with ON DELETE RESTRICT', async () => {
		// 1. Check NOT NULL constraint on user_id
		const [col] = await rawSql.unsafe(
			"SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
			"WHERE table_name = 'transcripts' AND column_name = 'user_id';"
		);
		expect(col.column_name).toBe('user_id');
		expect(col.data_type).toBe('uuid');
		expect(col.is_nullable).toBe('NO');

		// 2. Check Foreign Key constraint referencing users(id) with ON DELETE RESTRICT
		const fks = await rawSql.unsafe(
			"SELECT tc.constraint_name, rc.delete_rule " +
			"FROM information_schema.table_constraints tc " +
			"JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name " +
			"WHERE tc.table_name = 'transcripts' AND tc.constraint_type = 'FOREIGN KEY';"
		);
		const fk = fks.find((x: any) => x.constraint_name.includes('user_id'));
		expect(fk).toBeDefined();
		expect(fk.delete_rule).toBe('RESTRICT');
	});

	it('should successfully backfill legacy transcripts and preserve existing non-null owners', async () => {
		await rawSql.begin(async (tx) => {
			// Temporarily drop NOT NULL to simulate pre-migration state
			await tx.unsafe('ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_user_id_users_id_fk;');
			await tx.unsafe('ALTER TABLE transcripts ALTER COLUMN user_id DROP NOT NULL;');

			// Create a legacy transcript with NULL user_id
			const [legacyT] = await tx.unsafe(
				"INSERT INTO transcripts (raw_text, user_id) VALUES ('Legacy unassigned transcript', NULL) RETURNING id;"
			);

			// Create a transcript with an existing non-null user_id (standard user)
			const [ownedT] = await tx.unsafe(
				`INSERT INTO transcripts (raw_text, user_id) VALUES ('Already owned transcript', '${testUserId}') RETURNING id;`
			);

			// Execute migration logic
			const migrationSql = fs.readFileSync('drizzle/0004_cloudy_lightspeed.sql', 'utf8');
			const statements = migrationSql.split('--> statement-breakpoint');
			for (const s of statements) {
				if (s.trim()) {
					await tx.unsafe(s.trim());
				}
			}

			// Verify legacy transcript was backfilled to testAdminId
			const [checkLegacy] = await tx.unsafe(`SELECT user_id FROM transcripts WHERE id = ${legacyT.id};`);
			expect(checkLegacy.user_id).toBe(testAdminId);

			// Verify already-owned transcript was NOT overwritten and preserved testUserId
			const [checkOwned] = await tx.unsafe(`SELECT user_id FROM transcripts WHERE id = ${ownedT.id};`);
			expect(checkOwned.user_id).toBe(testUserId);

			// Rollback simulation so database remains clean
			throw new Error('ROLLBACK_CLEAN');
		}).catch((err) => {
			if (err.message !== 'ROLLBACK_CLEAN') throw err;
		});
	});

	it('should abort migration if no active Admin account exists', async () => {
		await rawSql.begin(async (tx) => {
			// Temporarily deactivate or remove admins inside transaction
			await tx.unsafe("UPDATE users SET is_active = false WHERE role = 'admin';");

			const migrationSql = fs.readFileSync('drizzle/0004_cloudy_lightspeed.sql', 'utf8');
			const statements = migrationSql.split('--> statement-breakpoint');

			let caughtError: any = null;
			try {
				await tx.unsafe(statements[0].trim());
			} catch (e) {
				caughtError = e;
			}

			expect(caughtError).not.toBeNull();
			expect(caughtError.message).toContain('No active Admin account exists');

			throw new Error('ROLLBACK_CLEAN');
		}).catch((err) => {
			if (err.message !== 'ROLLBACK_CLEAN') throw err;
		});
	});

	it('should abort migration if transcripts reference a non-existent user (orphan check)', async () => {
		await rawSql.begin(async (tx) => {
			await tx.unsafe('ALTER TABLE transcripts DROP CONSTRAINT transcripts_user_id_users_id_fk;');
			await tx.unsafe('ALTER TABLE transcripts ALTER COLUMN user_id DROP NOT NULL;');

			// Insert orphan transcript referencing non-existent UUID
			await tx.unsafe(
				"INSERT INTO transcripts (raw_text, user_id) VALUES ('Orphan transcript', '11111111-2222-3333-4444-555555555555');"
			);

			const migrationSql = fs.readFileSync('drizzle/0004_cloudy_lightspeed.sql', 'utf8');
			const statements = migrationSql.split('--> statement-breakpoint');

			let caughtError: any = null;
			try {
				await tx.unsafe(statements[0].trim());
			} catch (e) {
				caughtError = e;
			}

			expect(caughtError).not.toBeNull();
			expect(caughtError.message).toContain('reference non-existent users');

			throw new Error('ROLLBACK_CLEAN');
		}).catch((err) => {
			if (err.message !== 'ROLLBACK_CLEAN') throw err;
		});
	});

	it('should enforce NOT NULL and reject inserting a transcript with NULL user_id', async () => {
		let rejected = false;
		try {
			await rawSql.unsafe("INSERT INTO transcripts (raw_text, user_id) VALUES ('Invalid null text', NULL);");
		} catch (err: any) {
			rejected = true;
			expect(err.code).toBe('23502'); // not_null_violation in PostgreSQL
		}
		expect(rejected).toBe(true);
	});

	it('should enforce foreign key and reject inserting a transcript with a non-existent user_id', async () => {
		let rejected = false;
		try {
			await rawSql.unsafe(
				"INSERT INTO transcripts (raw_text, user_id) VALUES ('Invalid fk text', '99999999-9999-9999-9999-999999999999');"
			);
		} catch (err: any) {
			rejected = true;
			expect(err.code).toBe('23503'); // foreign_key_violation in PostgreSQL
		}
		expect(rejected).toBe(true);
	});

	it('should enforce ON DELETE RESTRICT and prevent deleting a user whose transcripts still exist', async () => {
		// Create a user with a transcript
		const [u] = await db
			.insert(users)
			.values({
				email: 'delete_restrict_test@example.com',
				passwordHash: 'hash',
				role: 'user',
				isActive: true
			})
			.returning({ id: users.id });

		const [t] = await db
			.insert(transcripts)
			.values({
				userId: u.id,
				rawText: 'Restricted deletion test transcript'
			})
			.returning({ id: transcripts.id });

		let deleteRejected = false;
		try {
			await db.delete(users).where(eq(users.id, u.id));
		} catch (err: any) {
			deleteRejected = true;
		}
		expect(deleteRejected).toBe(true);

		// Clean up transcript first, then user deletion succeeds
		await db.delete(transcripts).where(eq(transcripts.id, t.id));
		const deletedUser = await db.delete(users).where(eq(users.id, u.id)).returning();
		expect(deletedUser.length).toBe(1);
	});

	it('should preserve all child relationships (stories, criteria, runs, attempts) under their parent transcript', async () => {
		// Create transcript with complete child tree
		const [t] = await db
			.insert(transcripts)
			.values({
				userId: testAdminId,
				rawText: 'Integrity validation transcript'
			})
			.returning({ id: transcripts.id });

		const [story] = await db
			.insert(userStories)
			.values({
				transcriptId: t.id,
				role: 'Admin',
				feature: 'Manage',
				benefit: 'Audit',
				status: 'draft'
			})
			.returning({ id: userStories.id });

		const [ac] = await db
			.insert(acceptanceCriteria)
			.values({
				userStoryId: story.id,
				givenText: 'Given G',
				whenText: 'When W',
				thenText: 'Then T'
			})
			.returning({ id: acceptanceCriteria.id });

		const [run] = await db
			.insert(extractionRuns)
			.values({
				transcriptId: t.id,
				runNumber: 1,
				status: 'completed'
			})
			.returning({ id: extractionRuns.id });

		const [attempt] = await db
			.insert(extractionAttempts)
			.values({
				runId: run.id,
				attemptNumber: 1,
				modelName: 'openai/gpt-oss-120b',
				durationMs: 150,
				status: 'success'
			})
			.returning({ id: extractionAttempts.id });

		// Query relationship chain back to parent transcript and verify integrity
		const [parent] = await db.select().from(transcripts).where(eq(transcripts.id, t.id));
		expect(parent.userId).toBe(testAdminId);

		const [childStory] = await db.select().from(userStories).where(eq(userStories.transcriptId, t.id));
		expect(childStory.id).toBe(story.id);

		const [childAc] = await db.select().from(acceptanceCriteria).where(eq(acceptanceCriteria.userStoryId, story.id));
		expect(childAc.id).toBe(ac.id);

		const [childRun] = await db.select().from(extractionRuns).where(eq(extractionRuns.transcriptId, t.id));
		expect(childRun.id).toBe(run.id);

		const [childAttempt] = await db.select().from(extractionAttempts).where(eq(extractionAttempts.runId, run.id));
		expect(childAttempt.id).toBe(attempt.id);

		// Clean up
		await db.delete(transcripts).where(eq(transcripts.id, t.id));
	});
});
