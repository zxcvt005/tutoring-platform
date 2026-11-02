CREATE TABLE "press_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"frequency" text,
	"start_at" timestamp with time zone NOT NULL,
	"current_due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "press_reminder_completions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reminder_id" text NOT NULL,
	"user_id" text NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "trial_interaction_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"trial_lesson_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "press_reminders" ADD CONSTRAINT "press_reminders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_reminders" ADD CONSTRAINT "press_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_reminder_completions" ADD CONSTRAINT "press_reminder_completions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_reminder_completions" ADD CONSTRAINT "press_reminder_completions_reminder_id_press_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."press_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_reminder_completions" ADD CONSTRAINT "press_reminder_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_interaction_notes" ADD CONSTRAINT "trial_interaction_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_interaction_notes" ADD CONSTRAINT "trial_interaction_notes_trial_lesson_id_trial_lessons_id_fk" FOREIGN KEY ("trial_lesson_id") REFERENCES "public"."trial_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_interaction_notes" ADD CONSTRAINT "trial_interaction_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_reminders" ADD CONSTRAINT "press_reminders_kind_check" CHECK ("kind" in ('once', 'recurring'));--> statement-breakpoint
ALTER TABLE "press_reminders" ADD CONSTRAINT "press_reminders_frequency_check" CHECK ("frequency" is null or "frequency" in ('daily', 'weekly', 'monthly'));--> statement-breakpoint
ALTER TABLE "press_reminders" ADD CONSTRAINT "press_reminders_status_check" CHECK ("status" in ('active', 'disabled', 'archived'));--> statement-breakpoint
ALTER TABLE "press_reminders" ADD CONSTRAINT "press_reminders_kind_frequency_check" CHECK (("kind" = 'once' and "frequency" is null) or ("kind" = 'recurring' and "frequency" is not null));--> statement-breakpoint
CREATE INDEX "press_reminders_user_due_idx" ON "press_reminders" USING btree ("user_id","status","current_due_at");--> statement-breakpoint
CREATE INDEX "press_reminders_org_user_idx" ON "press_reminders" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prc_reminder_occurrence_uidx" ON "press_reminder_completions" USING btree ("reminder_id","occurrence_at");--> statement-breakpoint
CREATE INDEX "prc_user_completed_idx" ON "press_reminder_completions" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "tin_trial_created_idx" ON "trial_interaction_notes" USING btree ("trial_lesson_id","created_at");--> statement-breakpoint
CREATE INDEX "tin_org_idx" ON "trial_interaction_notes" USING btree ("organization_id");
