-- Единые иерархические папки учебных материалов (E1/E5).
-- Идемпотентный перенос topic_sections → material_folders (те же id).
-- folder_id на topics/tests/theory/intensives; старые section_id и topic_sections сохраняются.

CREATE TABLE IF NOT EXISTS "material_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"owner_scope" text DEFAULT 'teacher' NOT NULL,
	"teacher_id" text,
	"parent_id" text,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_folders_scope_check" CHECK ("owner_scope" in ('school', 'teacher')),
	CONSTRAINT "material_folders_owner_check" CHECK (
		("owner_scope" = 'school' and "teacher_id" is null)
		or
		("owner_scope" = 'teacher' and "teacher_id" is not null)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_folders" ADD CONSTRAINT "material_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_folders" ADD CONSTRAINT "material_folders_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_folders" ADD CONSTRAINT "material_folders_parent_id_material_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."material_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_folders_org_scope_idx" ON "material_folders" USING btree ("organization_id","owner_scope","teacher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_folders_parent_idx" ON "material_folders" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_folders_teacher_parent_idx" ON "material_folders" USING btree ("teacher_id","parent_id");
--> statement-breakpoint
INSERT INTO "material_folders" (
	"id",
	"organization_id",
	"owner_scope",
	"teacher_id",
	"parent_id",
	"title",
	"sort_order",
	"created_at",
	"updated_at"
)
SELECT
	s."id",
	s."organization_id",
	'teacher',
	s."teacher_id",
	NULL,
	s."title",
	s."sort_order",
	s."created_at",
	s."updated_at"
FROM "topic_sections" s
WHERE NOT EXISTS (
	SELECT 1 FROM "material_folders" f WHERE f."id" = s."id"
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
ALTER TABLE "theory_materials" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
ALTER TABLE "intensives" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topics" ADD CONSTRAINT "topics_folder_id_material_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."material_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tests" ADD CONSTRAINT "tests_folder_id_material_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."material_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_folder_id_material_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."material_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intensives" ADD CONSTRAINT "intensives_folder_id_material_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."material_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_folder_idx" ON "topics" USING btree ("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_folder_idx" ON "tests" USING btree ("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "theory_materials_folder_idx" ON "theory_materials" USING btree ("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intensives_folder_idx" ON "intensives" USING btree ("folder_id");
--> statement-breakpoint
UPDATE "topics" SET "folder_id" = "section_id"
WHERE "folder_id" IS NULL AND "section_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "material_folders" f WHERE f."id" = "topics"."section_id");
--> statement-breakpoint
UPDATE "tests" SET "folder_id" = "section_id"
WHERE "folder_id" IS NULL AND "section_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "material_folders" f WHERE f."id" = "tests"."section_id");
