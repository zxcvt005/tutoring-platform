-- Link CRM table «Пробные уроки» (manual_trial_lessons) to Press trial_lessons.
-- Synced fields: name, lesson_date, lesson_time. Other CRM columns stay manual.

ALTER TABLE "manual_trial_lessons" ADD COLUMN IF NOT EXISTS "trial_lesson_id" text;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "manual_trial_lessons" ADD CONSTRAINT "manual_trial_lessons_trial_lesson_id_trial_lessons_id_fk"
  FOREIGN KEY ("trial_lesson_id") REFERENCES "public"."trial_lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "manual_trial_lessons_trial_lesson_uidx"
  ON "manual_trial_lessons" ("trial_lesson_id")
  WHERE "trial_lesson_id" IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "manual_trial_lessons_trial_lesson_idx"
  ON "manual_trial_lessons" ("trial_lesson_id")
  WHERE "trial_lesson_id" IS NOT NULL;
