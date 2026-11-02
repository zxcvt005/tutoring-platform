ALTER TABLE "memberships" DROP CONSTRAINT "memberships_role_check";--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_check" CHECK ("role" in ('director', 'teacher', 'student', 'press'));--> statement-breakpoint
CREATE TABLE "student_sales_profiles" (
	"student_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"current_info" text DEFAULT '' NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "student_interaction_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "student_contact_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"completed_at" timestamp with time zone,
	"reminder_key" text NOT NULL,
	"created_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "trial_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"prospect_name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"teacher_notes" text DEFAULT '' NOT NULL,
	"sales_notes" text DEFAULT '' NOT NULL,
	"agreement_status" text DEFAULT 'not_discussed' NOT NULL,
	"lesson_status" text DEFAULT 'planned' NOT NULL,
	"created_by_user_id" text,
	"owner_user_id" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "trial_lesson_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"trial_lesson_id" text NOT NULL,
	"actor_user_id" text,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "press_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"student_id" text,
	"source_key" text NOT NULL,
	"due_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "student_sales_profiles" ADD CONSTRAINT "student_sales_profiles_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sales_profiles" ADD CONSTRAINT "student_sales_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sales_profiles" ADD CONSTRAINT "student_sales_profiles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_interaction_notes" ADD CONSTRAINT "student_interaction_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_interaction_notes" ADD CONSTRAINT "student_interaction_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_interaction_notes" ADD CONSTRAINT "student_interaction_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contact_tasks" ADD CONSTRAINT "student_contact_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contact_tasks" ADD CONSTRAINT "student_contact_tasks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contact_tasks" ADD CONSTRAINT "student_contact_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lesson_events" ADD CONSTRAINT "trial_lesson_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lesson_events" ADD CONSTRAINT "trial_lesson_events_trial_lesson_id_trial_lessons_id_fk" FOREIGN KEY ("trial_lesson_id") REFERENCES "public"."trial_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_lesson_events" ADD CONSTRAINT "trial_lesson_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_notifications" ADD CONSTRAINT "press_notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_notifications" ADD CONSTRAINT "press_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_notifications" ADD CONSTRAINT "press_notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contact_tasks" ADD CONSTRAINT "sct_status_check" CHECK ("status" in ('scheduled', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_agreement_check" CHECK ("agreement_status" in ('not_discussed', 'agreed', 'not_agreed'));--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_status_check" CHECK ("lesson_status" in ('planned', 'completed', 'cancelled', 'no_show'));--> statement-breakpoint
ALTER TABLE "trial_lessons" ADD CONSTRAINT "trial_lessons_time_check" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "trial_lesson_events" ADD CONSTRAINT "tle_type_check" CHECK ("event_type" in ('created', 'updated', 'rescheduled', 'agreement_changed', 'status_changed', 'cancelled', 'owner_changed'));--> statement-breakpoint
ALTER TABLE "press_notifications" ADD CONSTRAINT "press_notifications_kind_check" CHECK ("kind" in ('contact_due'));--> statement-breakpoint
CREATE INDEX "ssp_org_idx" ON "student_sales_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sin_student_created_idx" ON "student_interaction_notes" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "sin_org_idx" ON "student_interaction_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sct_reminder_key_uidx" ON "student_contact_tasks" USING btree ("reminder_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sct_one_scheduled_uidx" ON "student_contact_tasks" USING btree ("student_id") WHERE "status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "sct_due_idx" ON "student_contact_tasks" USING btree ("organization_id","due_at");--> statement-breakpoint
CREATE INDEX "sct_student_idx" ON "student_contact_tasks" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "trial_lessons_teacher_starts_idx" ON "trial_lessons" USING btree ("teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX "trial_lessons_org_starts_idx" ON "trial_lessons" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "trial_lessons_owner_idx" ON "trial_lessons" USING btree ("organization_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "tle_trial_created_idx" ON "trial_lesson_events" USING btree ("trial_lesson_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "press_notifications_source_uidx" ON "press_notifications" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "press_notifications_user_idx" ON "press_notifications" USING btree ("user_id","created_at");
