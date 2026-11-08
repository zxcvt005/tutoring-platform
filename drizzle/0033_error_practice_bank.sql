CREATE TABLE "student_error_bank" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"source_assignment_id" text,
	"source_test_id" text,
	"source_question_id" text NOT NULL,
	"question_snapshot" jsonb NOT NULL,
	"kim_number" integer,
	"first_error_at" timestamp with time zone NOT NULL,
	"last_error_at" timestamp with time zone NOT NULL,
	"incorrect_attempts_count" integer DEFAULT 1 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"mastered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seb_status_check" CHECK ("status" in ('waiting', 'available', 'mastered')),
	CONSTRAINT "seb_incorrect_check" CHECK ("incorrect_attempts_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "student_error_bank_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"error_bank_id" text,
	"source_question_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sebe_type_check" CHECK ("event_type" in ('recorded', 'repeated', 'available', 'mastered', 'reopened'))
);
--> statement-breakpoint
CREATE TABLE "error_practice_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"mode" text NOT NULL,
	"kim_number" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"question_count" integer NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"percent" numeric(6, 2),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eps_mode_check" CHECK ("mode" in ('random', 'kim')),
	CONSTRAINT "eps_status_check" CHECK ("status" in ('active', 'completed')),
	CONSTRAINT "eps_count_check" CHECK ("question_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "error_practice_session_items" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"position" integer NOT NULL,
	"source_kind" text NOT NULL,
	"error_bank_id" text,
	"source_question_id" text NOT NULL,
	"source_test_id" text,
	"source_assignment_id" text,
	"question_snapshot" jsonb NOT NULL,
	"kim_number" integer,
	"answer_payload" jsonb,
	"is_correct" boolean,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "epsi_source_check" CHECK ("source_kind" in ('bank', 'pool')),
	CONSTRAINT "epsi_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "student_error_bank" ADD CONSTRAINT "student_error_bank_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_error_bank" ADD CONSTRAINT "student_error_bank_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_error_bank" ADD CONSTRAINT "student_error_bank_source_assignment_id_test_assignments_id_fk" FOREIGN KEY ("source_assignment_id") REFERENCES "public"."test_assignments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_error_bank" ADD CONSTRAINT "student_error_bank_source_test_id_tests_id_fk" FOREIGN KEY ("source_test_id") REFERENCES "public"."tests"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_error_bank_events" ADD CONSTRAINT "student_error_bank_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_error_bank_events" ADD CONSTRAINT "student_error_bank_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_error_bank_events" ADD CONSTRAINT "student_error_bank_events_error_bank_id_student_error_bank_id_fk" FOREIGN KEY ("error_bank_id") REFERENCES "public"."student_error_bank"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "error_practice_sessions" ADD CONSTRAINT "error_practice_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "error_practice_sessions" ADD CONSTRAINT "error_practice_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "error_practice_session_items" ADD CONSTRAINT "error_practice_session_items_session_id_error_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."error_practice_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "error_practice_session_items" ADD CONSTRAINT "error_practice_session_items_error_bank_id_student_error_bank_id_fk" FOREIGN KEY ("error_bank_id") REFERENCES "public"."student_error_bank"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "seb_student_status_idx" ON "student_error_bank" USING btree ("student_id","status");
--> statement-breakpoint
CREATE INDEX "seb_student_available_idx" ON "student_error_bank" USING btree ("student_id","available_at");
--> statement-breakpoint
CREATE INDEX "seb_org_idx" ON "student_error_bank" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "seb_kim_idx" ON "student_error_bank" USING btree ("student_id","kim_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "seb_active_question_uidx" ON "student_error_bank" USING btree ("student_id","source_question_id") WHERE "status" in ('waiting', 'available');
--> statement-breakpoint
CREATE INDEX "sebe_student_created_idx" ON "student_error_bank_events" USING btree ("student_id","created_at");
--> statement-breakpoint
CREATE INDEX "sebe_bank_idx" ON "student_error_bank_events" USING btree ("error_bank_id");
--> statement-breakpoint
CREATE INDEX "eps_student_idx" ON "error_practice_sessions" USING btree ("student_id","status");
--> statement-breakpoint
CREATE INDEX "eps_org_idx" ON "error_practice_sessions" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "eps_one_active_uidx" ON "error_practice_sessions" USING btree ("student_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX "epsi_session_position_uidx" ON "error_practice_session_items" USING btree ("session_id","position");
--> statement-breakpoint
CREATE INDEX "epsi_session_idx" ON "error_practice_session_items" USING btree ("session_id");
