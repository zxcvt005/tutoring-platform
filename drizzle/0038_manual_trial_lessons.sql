-- Ручные «Пробные уроки» (Дирекция).
-- Изолированная таблица: не связана с trial_lessons (Press), base_leads, учениками и расписанием.
-- Не запускать на Production без явного разрешения.

CREATE TABLE IF NOT EXISTS "manual_trial_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lesson_date" text NOT NULL,
	"lesson_time" text DEFAULT '12:00' NOT NULL,
	"source" text,
	"name" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"attended" boolean DEFAULT false NOT NULL,
	"purchased" boolean DEFAULT false NOT NULL,
	"hours_per_week" integer,
	"rate_per_hour_rub" integer,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "manual_trial_lessons"
    ADD CONSTRAINT "manual_trial_lessons_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "manual_trial_lessons"
    ADD CONSTRAINT "manual_trial_lessons_source_check"
    CHECK (
      "source" is null
      or "source" in ('Профи', 'Авито', 'Реклама', 'Сарафан', 'Блог')
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "manual_trial_lessons"
    ADD CONSTRAINT "manual_trial_lessons_lesson_date_check"
    CHECK ("lesson_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "manual_trial_lessons"
    ADD CONSTRAINT "manual_trial_lessons_lesson_time_check"
    CHECK ("lesson_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "manual_trial_lessons"
    ADD CONSTRAINT "manual_trial_lessons_hours_check"
    CHECK ("hours_per_week" is null or "hours_per_week" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "manual_trial_lessons"
    ADD CONSTRAINT "manual_trial_lessons_rate_check"
    CHECK ("rate_per_hour_rub" is null or "rate_per_hour_rub" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_trial_lessons_org_idx"
  ON "manual_trial_lessons" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_trial_lessons_org_created_idx"
  ON "manual_trial_lessons" USING btree ("organization_id","created_at");
