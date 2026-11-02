CREATE TABLE "lesson_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"score" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_score_check" CHECK ("score" >= 1 AND "score" <= 10);--> statement-breakpoint
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_comment_check" CHECK ("score" >= 8 OR char_length(btrim("comment")) > 0);--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_ratings_lesson_student_uidx" ON "lesson_ratings" USING btree ("lesson_id","student_id");--> statement-breakpoint
CREATE INDEX "lesson_ratings_org_submitted_idx" ON "lesson_ratings" USING btree ("organization_id","submitted_at");--> statement-breakpoint
CREATE INDEX "lesson_ratings_teacher_submitted_idx" ON "lesson_ratings" USING btree ("teacher_id","submitted_at");--> statement-breakpoint
CREATE INDEX "lesson_ratings_student_idx" ON "lesson_ratings" USING btree ("student_id");
