ALTER TABLE "topics" ALTER COLUMN "teacher_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "library_scope" text DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_scope_check" CHECK ("library_scope" in ('school', 'teacher'));--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_owner_check" CHECK (("library_scope" = 'school' AND "teacher_id" IS NULL) OR ("library_scope" = 'teacher' AND "teacher_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "tests" ALTER COLUMN "teacher_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "library_scope" text DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_scope_check" CHECK ("library_scope" in ('school', 'teacher'));--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_owner_check" CHECK (("library_scope" = 'school' AND "teacher_id" IS NULL) OR ("library_scope" = 'teacher' AND "teacher_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "theory_materials" ALTER COLUMN "teacher_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "theory_materials" ADD COLUMN "library_scope" text DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_scope_check" CHECK ("library_scope" in ('school', 'teacher'));--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_owner_check" CHECK (("library_scope" = 'school' AND "teacher_id" IS NULL) OR ("library_scope" = 'teacher' AND "teacher_id" IS NOT NULL));--> statement-breakpoint
CREATE TABLE "material_origins" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "material_kind" text NOT NULL,
  "material_id" text NOT NULL,
  "source_kind" text NOT NULL,
  "source_id" text,
  "source_title" text NOT NULL,
  "source_author_name" text,
  "source_version_id" text,
  "source_scope" text DEFAULT 'school' NOT NULL,
  "copied_at" timestamptz DEFAULT now() NOT NULL,
  "copied_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "material_origins_kind_check" CHECK ("material_kind" in ('theory', 'test', 'topic')),
  CONSTRAINT "material_origins_source_kind_check" CHECK ("source_kind" in ('theory', 'test', 'topic')),
  CONSTRAINT "material_origins_scope_check" CHECK ("source_scope" in ('school', 'teacher'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "material_origins_material_uidx" ON "material_origins" ("material_kind", "material_id");--> statement-breakpoint
CREATE INDEX "material_origins_source_idx" ON "material_origins" ("organization_id", "source_kind", "source_id");
