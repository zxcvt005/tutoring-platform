-- System knowledge-base folders (subject × grade) + allow student grade 7.

ALTER TABLE "material_folders" ADD COLUMN IF NOT EXISTS "system_key" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "material_folders_system_key_uidx"
  ON "material_folders" (
    "organization_id",
    "owner_scope",
    (COALESCE("teacher_id", '')),
    "system_key"
  )
  WHERE "system_key" IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "material_folders_system_key_idx"
  ON "material_folders" ("system_key")
  WHERE "system_key" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_grade_check";--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_grade_check" CHECK (
  "grade" is null or "grade" in ('7', '8', '9', '10', '11')
);
