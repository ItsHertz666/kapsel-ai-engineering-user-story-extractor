import { pgTable, serial, text, integer, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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

export const transcripts = pgTable('transcripts', {
	id: serial('id').primaryKey(),
	originalFilename: text('original_filename'),
	rawText: text('raw_text').notNull(),
	status: transcriptStatusEnum('status').default('queued'),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date())
});

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

export const transcriptsRelations = relations(transcripts, ({ many }) => ({
	userStories: many(userStories)
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
