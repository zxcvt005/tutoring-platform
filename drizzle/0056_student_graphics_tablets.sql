-- Рабочая таблица «Графические планшеты» (кабинет Пресса).
-- Одна строка на ученика; список строится из students LEFT JOIN.

CREATE TABLE IF NOT EXISTS "student_graphics_tablets" (
  "student_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "trial_completed" boolean DEFAULT false NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "tablet_status" text DEFAULT 'not_needed' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "student_graphics_tablets" ADD CONSTRAINT "student_graphics_tablets_student_id_students_id_fk"
  FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "student_graphics_tablets" ADD CONSTRAINT "student_graphics_tablets_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "student_graphics_tablets_org_idx"
  ON "student_graphics_tablets" ("organization_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "student_graphics_tablets_org_updated_idx"
  ON "student_graphics_tablets" ("organization_id", "updated_at");--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "student_graphics_tablets" ADD CONSTRAINT "student_graphics_tablets_status_check"
  CHECK ("tablet_status" in ('not_needed', 'ordered'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
