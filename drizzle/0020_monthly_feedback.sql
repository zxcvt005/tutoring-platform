CREATE TABLE "monthly_feedback_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"teacher_comment" text DEFAULT '' NOT NULL,
	"metrics_snapshot" jsonb,
	"submitted_at" timestamp with time zone,
	"submitted_by_user_id" text,
	"press_status" text,
	"press_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"processed_by_user_id" text,
	"parent_message_text" text DEFAULT '' NOT NULL,
	"parent_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "monthly_feedback_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "monthly_feedback_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "monthly_feedback_reports_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "monthly_feedback_reports_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "monthly_feedback_reports_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "mfr_period_month_check" CHECK ("period_month" >= 1 AND "period_month" <= 12);--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "mfr_period_year_check" CHECK ("period_year" >= 2020 AND "period_year" <= 2100);--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "mfr_press_status_check" CHECK ("press_status" is null or "press_status" in ('pending', 'in_progress', 'processed'));--> statement-breakpoint
ALTER TABLE "monthly_feedback_reports" ADD CONSTRAINT "mfr_submit_press_check" CHECK (("submitted_at" is null and "press_status" is null) or ("submitted_at" is not null and "press_status" is not null));--> statement-breakpoint
CREATE UNIQUE INDEX "mfr_student_teacher_period_uidx" ON "monthly_feedback_reports" USING btree ("student_id","teacher_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "mfr_teacher_period_idx" ON "monthly_feedback_reports" USING btree ("teacher_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "mfr_org_press_idx" ON "monthly_feedback_reports" USING btree ("organization_id","press_status","submitted_at");
