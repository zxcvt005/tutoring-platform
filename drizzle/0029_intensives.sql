CREATE TABLE "intensives" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text,
	"library_scope" text DEFAULT 'teacher' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"video_url" text,
	"video_provider" text,
	"video_embed_url" text,
	"embed_allowed" boolean DEFAULT false NOT NULL,
	"video_warning" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intensives_status_check" CHECK ("status" in ('draft', 'published', 'archived')),
	CONSTRAINT "intensives_provider_check" CHECK ("video_provider" is null or "video_provider" in ('vk', 'youtube', 'rutube', 'unknown')),
	CONSTRAINT "intensives_scope_check" CHECK ("library_scope" in ('school', 'teacher')),
	CONSTRAINT "intensives_owner_check" CHECK (("library_scope" = 'school' and "teacher_id" is null) or ("library_scope" = 'teacher' and "teacher_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "intensive_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"intensive_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"video_url" text,
	"video_provider" text,
	"video_embed_url" text,
	"embed_allowed" boolean DEFAULT false NOT NULL,
	"video_warning" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intensive_files" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"intensive_id" text NOT NULL,
	"version_id" text,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intensive_files_size_check" CHECK ("size_bytes" >= 0 AND "size_bytes" <= 20971520)
);
--> statement-breakpoint
CREATE TABLE "intensive_tests" (
	"intensive_id" text NOT NULL,
	"test_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "intensive_tests_pk" PRIMARY KEY("intensive_id","test_id")
);
--> statement-breakpoint
CREATE TABLE "intensive_version_tests" (
	"version_id" text NOT NULL,
	"test_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "intensive_version_tests_pk" PRIMARY KEY("version_id","test_id")
);
--> statement-breakpoint
CREATE TABLE "intensive_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"intensive_id" text NOT NULL,
	"version_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assigned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intensive_assignment_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"test_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"test_assignment_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intensives" ADD CONSTRAINT "intensives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensives" ADD CONSTRAINT "intensives_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_versions" ADD CONSTRAINT "intensive_versions_intensive_id_intensives_id_fk" FOREIGN KEY ("intensive_id") REFERENCES "public"."intensives"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_files" ADD CONSTRAINT "intensive_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_files" ADD CONSTRAINT "intensive_files_intensive_id_intensives_id_fk" FOREIGN KEY ("intensive_id") REFERENCES "public"."intensives"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_files" ADD CONSTRAINT "intensive_files_version_id_intensive_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."intensive_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_tests" ADD CONSTRAINT "intensive_tests_intensive_id_intensives_id_fk" FOREIGN KEY ("intensive_id") REFERENCES "public"."intensives"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_tests" ADD CONSTRAINT "intensive_tests_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_version_tests" ADD CONSTRAINT "intensive_version_tests_version_id_intensive_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."intensive_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_version_tests" ADD CONSTRAINT "intensive_version_tests_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignments" ADD CONSTRAINT "intensive_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignments" ADD CONSTRAINT "intensive_assignments_intensive_id_intensives_id_fk" FOREIGN KEY ("intensive_id") REFERENCES "public"."intensives"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignments" ADD CONSTRAINT "intensive_assignments_version_id_intensive_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."intensive_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignments" ADD CONSTRAINT "intensive_assignments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignments" ADD CONSTRAINT "intensive_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignments" ADD CONSTRAINT "intensive_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignment_tests" ADD CONSTRAINT "intensive_assignment_tests_assignment_id_intensive_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."intensive_assignments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignment_tests" ADD CONSTRAINT "intensive_assignment_tests_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intensive_assignment_tests" ADD CONSTRAINT "intensive_assignment_tests_test_assignment_id_test_assignments_id_fk" FOREIGN KEY ("test_assignment_id") REFERENCES "public"."test_assignments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "intensives_teacher_idx" ON "intensives" USING btree ("teacher_id");
--> statement-breakpoint
CREATE INDEX "intensives_org_idx" ON "intensives" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "intensive_versions_intensive_idx" ON "intensive_versions" USING btree ("intensive_id");
--> statement-breakpoint
CREATE INDEX "intensive_files_intensive_idx" ON "intensive_files" USING btree ("intensive_id");
--> statement-breakpoint
CREATE INDEX "intensive_files_version_idx" ON "intensive_files" USING btree ("version_id");
--> statement-breakpoint
CREATE INDEX "intensive_files_key_idx" ON "intensive_files" USING btree ("object_key");
--> statement-breakpoint
CREATE INDEX "intensive_tests_test_idx" ON "intensive_tests" USING btree ("test_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "intensive_assignments_intensive_student_uidx" ON "intensive_assignments" USING btree ("intensive_id","student_id");
--> statement-breakpoint
CREATE INDEX "intensive_assignments_student_idx" ON "intensive_assignments" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX "intensive_assignments_teacher_idx" ON "intensive_assignments" USING btree ("teacher_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "intensive_assignment_tests_assignment_test_uidx" ON "intensive_assignment_tests" USING btree ("assignment_id","test_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "intensive_assignment_tests_attempt_uidx" ON "intensive_assignment_tests" USING btree ("test_assignment_id");
--> statement-breakpoint
ALTER TABLE "test_assignments" DROP CONSTRAINT "test_assignments_source_kind_check";
--> statement-breakpoint
ALTER TABLE "test_assignments" ADD CONSTRAINT "test_assignments_source_kind_check" CHECK ("source_kind" in ('homework', 'theory', 'intensive'));
