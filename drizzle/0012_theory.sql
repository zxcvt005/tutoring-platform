ALTER TABLE "tests" ADD COLUMN "purpose" text DEFAULT 'homework' NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_purpose_check" CHECK ("purpose" in ('homework', 'theory'));--> statement-breakpoint
ALTER TABLE "test_assignments" ADD COLUMN "source_kind" text DEFAULT 'homework' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_assignments" ADD CONSTRAINT "test_assignments_source_kind_check" CHECK ("source_kind" in ('homework', 'theory'));--> statement-breakpoint
CREATE TABLE "theory_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"video_url" text,
	"video_provider" text,
	"video_embed_url" text,
	"embed_allowed" boolean DEFAULT false NOT NULL,
	"video_warning" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"test_id" text,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "theory_material_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"material_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"video_url" text NOT NULL,
	"video_provider" text,
	"video_embed_url" text,
	"embed_allowed" boolean DEFAULT false NOT NULL,
	"video_warning" text,
	"test_id" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "theory_files" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"material_id" text NOT NULL,
	"version_id" text,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "theory_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"material_id" text NOT NULL,
	"version_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assigned_by_user_id" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"viewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"test_assignment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_status_check" CHECK ("status" in ('draft', 'published', 'archived'));--> statement-breakpoint
ALTER TABLE "theory_materials" ADD CONSTRAINT "theory_materials_provider_check" CHECK ("video_provider" is null or "video_provider" in ('vk', 'youtube', 'rutube', 'unknown'));--> statement-breakpoint
ALTER TABLE "theory_material_versions" ADD CONSTRAINT "theory_material_versions_material_id_theory_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."theory_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_material_versions" ADD CONSTRAINT "theory_material_versions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_files" ADD CONSTRAINT "theory_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_files" ADD CONSTRAINT "theory_files_material_id_theory_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."theory_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_files" ADD CONSTRAINT "theory_files_version_id_theory_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."theory_material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_files" ADD CONSTRAINT "theory_files_size_check" CHECK ("size_bytes" >= 0 AND "size_bytes" <= 20971520);--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_material_id_theory_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."theory_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_version_id_theory_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."theory_material_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_test_assignment_id_test_assignments_id_fk" FOREIGN KEY ("test_assignment_id") REFERENCES "public"."test_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_assignments" ADD CONSTRAINT "theory_assignments_status_check" CHECK ("status" in ('assigned', 'viewed', 'in_progress', 'awaiting_review', 'completed'));--> statement-breakpoint
CREATE INDEX "theory_materials_teacher_idx" ON "theory_materials" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "theory_materials_org_idx" ON "theory_materials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "theory_versions_material_idx" ON "theory_material_versions" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "theory_files_material_idx" ON "theory_files" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "theory_files_version_idx" ON "theory_files" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "theory_files_key_idx" ON "theory_files" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "theory_assignments_material_student_uidx" ON "theory_assignments" USING btree ("material_id","student_id");--> statement-breakpoint
CREATE INDEX "theory_assignments_student_idx" ON "theory_assignments" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "theory_assignments_teacher_idx" ON "theory_assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "theory_assignments_test_idx" ON "theory_assignments" USING btree ("test_assignment_id");
