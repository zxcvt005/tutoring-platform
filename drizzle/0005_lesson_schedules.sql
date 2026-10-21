CREATE TABLE "lesson_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"subject" text,
	"weekdays" jsonb NOT NULL,
	"start_time" text NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"active_until" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_schedule_students" (
	"schedule_id" text NOT NULL,
	"student_id" text NOT NULL,
	CONSTRAINT "lesson_schedule_students_schedule_id_student_id_pk" PRIMARY KEY("schedule_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "schedule_id" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "schedule_occurrence_key" text;--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD CONSTRAINT "lesson_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD CONSTRAINT "lesson_schedules_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedule_students" ADD CONSTRAINT "lesson_schedule_students_schedule_id_lesson_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."lesson_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedule_students" ADD CONSTRAINT "lesson_schedule_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_schedule_id_lesson_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."lesson_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_schedules_org_idx" ON "lesson_schedules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lesson_schedules_teacher_idx" ON "lesson_schedules" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "lesson_schedule_students_student_idx" ON "lesson_schedule_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "lessons_schedule_idx" ON "lessons" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_schedule_occurrence_uidx" ON "lessons" USING btree ("schedule_id","schedule_occurrence_key");--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD CONSTRAINT "lesson_schedules_status_check" CHECK ("status" in ('active', 'paused', 'archived'));
