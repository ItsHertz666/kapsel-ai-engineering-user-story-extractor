CREATE TYPE "public"."transcript_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_story_status" AS ENUM('draft', 'edited', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "acceptance_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_story_id" integer NOT NULL,
	"given_text" text NOT NULL,
	"when_text" text NOT NULL,
	"then_text" text NOT NULL,
	"sort_order" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_filename" text,
	"raw_text" text NOT NULL,
	"status" "transcript_status" DEFAULT 'queued',
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"transcript_id" integer NOT NULL,
	"role" text NOT NULL,
	"feature" text NOT NULL,
	"benefit" text NOT NULL,
	"raw_ai_output" jsonb,
	"status" "user_story_status" DEFAULT 'draft',
	"invest_score" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "acceptance_criteria" ADD CONSTRAINT "acceptance_criteria_user_story_id_user_stories_id_fk" FOREIGN KEY ("user_story_id") REFERENCES "public"."user_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;