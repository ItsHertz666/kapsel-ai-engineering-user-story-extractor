CREATE TYPE "public"."extraction_attempt_status" AS ENUM('response_received', 'success', 'parse_error', 'api_error', 'network_error');--> statement-breakpoint
CREATE TYPE "public"."extraction_run_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "extraction_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"attempt_number" integer NOT NULL,
	"model_name" text NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"http_status_code" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"duration_ms" integer NOT NULL,
	"status" "extraction_attempt_status" NOT NULL,
	"prompt_rate_per_million_usd" double precision,
	"completion_rate_per_million_usd" double precision,
	"estimated_cost_usd" double precision,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"transcript_id" integer NOT NULL,
	"run_number" integer NOT NULL,
	"status" "extraction_run_status" DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "extraction_attempts" ADD CONSTRAINT "extraction_attempts_run_id_extraction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_attempts_run_attempt_unique" ON "extraction_attempts" USING btree ("run_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_runs_transcript_run_unique" ON "extraction_runs" USING btree ("transcript_id","run_number");