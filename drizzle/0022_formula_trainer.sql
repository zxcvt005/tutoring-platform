CREATE TABLE "formula_trainer_settings" (
	"student_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"mode" text DEFAULT 'choice' NOT NULL,
	"selected_subsections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weak_spots_only" boolean DEFAULT false NOT NULL,
	"quick_question" jsonb,
	"recent_formula_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "formula_trainer_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"formula_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "formula_trainer_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"formula_id" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb,
	"correct_option_id" text,
	"source" text DEFAULT 'trainer' NOT NULL,
	"answered_at" timestamp with time zone,
	"is_correct" boolean,
	"student_answer" text,
	"selected_option_id" text,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "formula_trainer_settings" ADD CONSTRAINT "formula_trainer_settings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_trainer_settings" ADD CONSTRAINT "formula_trainer_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "formula_trainer_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "formula_trainer_progress_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD CONSTRAINT "formula_trainer_questions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD CONSTRAINT "formula_trainer_questions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_trainer_settings" ADD CONSTRAINT "fts_mode_check" CHECK ("mode" in ('choice', 'manual', 'mixed'));--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "ftp_status_check" CHECK ("status" in ('new', 'needs_review', 'mastered'));--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "ftp_attempts_check" CHECK ("attempts" >= 0);--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "ftp_correct_check" CHECK ("correct_count" >= 0);--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "ftp_wrong_check" CHECK ("wrong_count" >= 0);--> statement-breakpoint
ALTER TABLE "formula_trainer_progress" ADD CONSTRAINT "ftp_streak_check" CHECK ("streak" >= 0);--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD CONSTRAINT "ftq_kind_check" CHECK ("kind" in ('choice', 'manual'));--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD CONSTRAINT "ftq_source_check" CHECK ("source" in ('quick', 'trainer'));--> statement-breakpoint
CREATE INDEX "fts_org_idx" ON "formula_trainer_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ftp_student_formula_uidx" ON "formula_trainer_progress" USING btree ("student_id","formula_id");--> statement-breakpoint
CREATE INDEX "ftp_student_idx" ON "formula_trainer_progress" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "ftp_org_idx" ON "formula_trainer_progress" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ftp_status_idx" ON "formula_trainer_progress" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "ftq_student_idx" ON "formula_trainer_questions" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "ftq_org_idx" ON "formula_trainer_questions" USING btree ("organization_id");
