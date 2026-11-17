-- Student invite onboarding + weekly availability slots.
-- Existing students are treated as fully onboarded (onboarding_status = complete).

ALTER TABLE "students" ADD COLUMN "parent_name" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "learning_goal" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "onboarding_status" text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
UPDATE "students" SET "onboarding_status" = 'complete' WHERE "onboarding_status" IS NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_onboarding_status_check" CHECK (
  "onboarding_status" in ('invited', 'profile_pending', 'availability_pending', 'complete')
);--> statement-breakpoint
CREATE INDEX "students_onboarding_status_idx" ON "students" ("organization_id", "onboarding_status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_availability_slots" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "student_id" text NOT NULL,
  "weekday" integer NOT NULL,
  "hour_start" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_availability_slots" ADD CONSTRAINT "student_availability_slots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_availability_slots" ADD CONSTRAINT "student_availability_slots_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "student_availability_slots" ADD CONSTRAINT "student_availability_weekday_check" CHECK ("weekday" >= 1 AND "weekday" <= 7);--> statement-breakpoint
ALTER TABLE "student_availability_slots" ADD CONSTRAINT "student_availability_hour_check" CHECK ("hour_start" >= 7 AND "hour_start" <= 23);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_availability_unique_slot_uidx" ON "student_availability_slots" ("student_id", "weekday", "hour_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_availability_student_idx" ON "student_availability_slots" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_availability_org_idx" ON "student_availability_slots" ("organization_id");--> statement-breakpoint

-- Raw token kept until used so director can re-copy the same invite link.
ALTER TABLE "account_invitations" ADD COLUMN IF NOT EXISTS "raw_token" text;
