import { pgTable, serial, text, integer, jsonb, timestamp, pgEnum, boolean, uniqueIndex, doublePrecision, uuid, varchar, char, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', [
	'user',
	'admin'
]);

export const transcriptStatusEnum = pgEnum('transcript_status', [
	'queued',
	'processing',
	'completed',
	'failed'
]);

export const userStoryStatusEnum = pgEnum('user_story_status', [
	'draft',
	'edited',
	'approved',
	'rejected'
]);

export const extractionRunStatusEnum = pgEnum('extraction_run_status', [
	'processing',
	'completed',
	'failed'
]);

export const extractionAttemptStatusEnum = pgEnum('extraction_attempt_status', [
	'response_received', // HTTP 200 received with usage metadata, awaiting parsing
	'success',           // HTTP 200, parsed and verified successfully
	'parse_error',       // HTTP 200, tokens billed, but JSON / schema validation failed
	'api_error',         // HTTP 4xx/5xx returned by OpenRouter API
	'network_error'      // Fetch threw (DNS failure, connection reset, timeout)
]);

export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	role: userRoleEnum('role').default('user').notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date())
});

export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		sessionTokenHash: char('session_token_hash', { length: 64 }).notNull(),
		csrfTokenHash: char('csrf_token_hash', { length: 64 }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('sessions_session_token_hash_unique').on(table.sessionTokenHash),
		index('sessions_user_id_idx').on(table.userId)
	]
);

export const auditLogs = pgTable('audit_logs', {
	id: uuid('id').defaultRandom().primaryKey(),
	adminUserId: uuid('admin_user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'restrict' }),
	action: varchar('action', { length: 64 }).notNull(),
	resourceType: varchar('resource_type', { length: 64 }).notNull(),
	resourceId: varchar('resource_id', { length: 64 }).notNull(),
	details: jsonb('details').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const transcripts = pgTable('transcripts', {
	id: serial('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'restrict' }),
	originalFilename: text('original_filename'),
	rawText: text('raw_text').notNull(),
	status: transcriptStatusEnum('status').default('queued'),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date())
});

export const extractionRuns = pgTable(
	'extraction_runs',
	{
		id: serial('id').primaryKey(),
		transcriptId: integer('transcript_id')
			.notNull()
			.references(() => transcripts.id, { onDelete: 'cascade' }),
		runNumber: integer('run_number').notNull(),
		status: extractionRunStatusEnum('status').default('processing').notNull(),
		errorMessage: text('error_message'),
		startedAt: timestamp('started_at').defaultNow().notNull(),
		completedAt: timestamp('completed_at')
	},
	(table) => [
		uniqueIndex('extraction_runs_transcript_run_unique').on(table.transcriptId, table.runNumber)
	]
);

export const extractionAttempts = pgTable(
	'extraction_attempts',
	{
		id: serial('id').primaryKey(),
		runId: integer('run_id')
			.notNull()
			.references(() => extractionRuns.id, { onDelete: 'cascade' }),
		attemptNumber: integer('attempt_number').notNull(),
		modelName: text('model_name').notNull(),
		isFallback: boolean('is_fallback').default(false).notNull(),
		httpStatusCode: integer('http_status_code'),
		promptTokens: integer('prompt_tokens'),
		completionTokens: integer('completion_tokens'),
		totalTokens: integer('total_tokens'),
		durationMs: integer('duration_ms').notNull(),
		status: extractionAttemptStatusEnum('status').notNull(),
		promptRatePerMillionUsd: doublePrecision('prompt_rate_per_million_usd'),
		completionRatePerMillionUsd: doublePrecision('completion_rate_per_million_usd'),
		estimatedCostUsd: doublePrecision('estimated_cost_usd'),
		errorMessage: text('error_message'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('extraction_attempts_run_attempt_unique').on(table.runId, table.attemptNumber)
	]
);

export const userStories = pgTable('user_stories', {
	id: serial('id').primaryKey(),
	transcriptId: integer('transcript_id')
		.notNull()
		.references(() => transcripts.id, { onDelete: 'cascade' }),
	role: text('role').notNull(),
	feature: text('feature').notNull(),
	benefit: text('benefit').notNull(),
	rawAiOutput: jsonb('raw_ai_output'),
	status: userStoryStatusEnum('status').default('draft'),
	investScore: jsonb('invest_score'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date())
});

export const acceptanceCriteria = pgTable('acceptance_criteria', {
	id: serial('id').primaryKey(),
	userStoryId: integer('user_story_id')
		.notNull()
		.references(() => userStories.id, { onDelete: 'cascade' }),
	givenText: text('given_text').notNull(),
	whenText: text('when_text').notNull(),
	thenText: text('then_text').notNull(),
	sortOrder: integer('sort_order'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date())
});

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	transcripts: many(transcripts),
	auditLogs: many(auditLogs)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	})
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
	adminUser: one(users, {
		fields: [auditLogs.adminUserId],
		references: [users.id]
	})
}));

export const transcriptsRelations = relations(transcripts, ({ one, many }) => ({
	user: one(users, {
		fields: [transcripts.userId],
		references: [users.id]
	}),
	userStories: many(userStories),
	extractionRuns: many(extractionRuns)
}));

export const extractionRunsRelations = relations(extractionRuns, ({ one, many }) => ({
	transcript: one(transcripts, {
		fields: [extractionRuns.transcriptId],
		references: [transcripts.id]
	}),
	attempts: many(extractionAttempts)
}));

export const extractionAttemptsRelations = relations(extractionAttempts, ({ one }) => ({
	run: one(extractionRuns, {
		fields: [extractionAttempts.runId],
		references: [extractionRuns.id]
	})
}));

export const userStoriesRelations = relations(userStories, ({ one, many }) => ({
	transcript: one(transcripts, {
		fields: [userStories.transcriptId],
		references: [transcripts.id]
	}),
	acceptanceCriteria: many(acceptanceCriteria)
}));

export const acceptanceCriteriaRelations = relations(acceptanceCriteria, ({ one }) => ({
	userStory: one(userStories, {
		fields: [acceptanceCriteria.userStoryId],
		references: [userStories.id]
	})
}));
