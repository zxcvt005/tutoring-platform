CREATE TABLE "formula_trainer_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"mode" text DEFAULT 'choice' NOT NULL,
	"weak_spots_only" boolean DEFAULT false NOT NULL,
	"selected_subsections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"formula_ids" jsonb NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ftsess_status_check" CHECK ("status" in ('active', 'completed')),
	CONSTRAINT "ftsess_mode_check" CHECK ("mode" in ('choice', 'manual', 'mixed')),
	CONSTRAINT "ftsess_count_check" CHECK ("question_count" > 0),
	CONSTRAINT "ftsess_index_check" CHECK ("current_index" >= 0)
);
--> statement-breakpoint
ALTER TABLE "formula_trainer_sessions" ADD CONSTRAINT "formula_trainer_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "formula_trainer_sessions" ADD CONSTRAINT "formula_trainer_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD COLUMN "session_id" text;
--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD COLUMN "position" integer;
--> statement-breakpoint
ALTER TABLE "formula_trainer_questions" ADD CONSTRAINT "formula_trainer_questions_session_id_formula_trainer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."formula_trainer_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ftsess_student_idx" ON "formula_trainer_sessions" USING btree ("student_id","status");
--> statement-breakpoint
CREATE INDEX "ftsess_org_idx" ON "formula_trainer_sessions" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ftsess_one_active_uidx" ON "formula_trainer_sessions" USING btree ("student_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "ftq_session_idx" ON "formula_trainer_questions" USING btree ("session_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "ftq_session_position_uidx" ON "formula_trainer_questions" USING btree ("session_id","position") WHERE "session_id" is not null;
