CREATE TABLE "mock_exams" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"exam_date" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_exams_exam_date_check" CHECK ("exam_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mock_exams_teacher_date_idx" ON "mock_exams" USING btree ("teacher_id","exam_date");
--> statement-breakpoint
CREATE INDEX "mock_exams_org_idx" ON "mock_exams" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE "mock_exam_results" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"mock_exam_id" text NOT NULL,
	"student_id" text NOT NULL,
	"primary_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_exam_results_score_check" CHECK ("primary_score" >= 0 AND "primary_score" <= 45)
);
--> statement-breakpoint
ALTER TABLE "mock_exam_results" ADD CONSTRAINT "mock_exam_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mock_exam_results" ADD CONSTRAINT "mock_exam_results_mock_exam_id_mock_exams_id_fk" FOREIGN KEY ("mock_exam_id") REFERENCES "public"."mock_exams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mock_exam_results" ADD CONSTRAINT "mock_exam_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "mock_exam_results_exam_student_uidx" ON "mock_exam_results" USING btree ("mock_exam_id","student_id");
--> statement-breakpoint
CREATE INDEX "mock_exam_results_student_idx" ON "mock_exam_results" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX "mock_exam_results_org_idx" ON "mock_exam_results" USING btree ("organization_id");
