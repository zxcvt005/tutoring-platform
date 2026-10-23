ALTER TABLE "tests" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "section_id" text;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_section_id_topic_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."topic_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tests_section_idx" ON "tests" USING btree ("section_id");--> statement-breakpoint
UPDATE "tests" AS te
SET "section_id" = tp."section_id"
FROM "topics" AS tp
WHERE tp."id" = te."topic_id" AND te."section_id" IS NULL;--> statement-breakpoint
ALTER TABLE "test_assignments" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "test_assignments" ADD COLUMN "attempt1_percent" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "test_assignments" ADD COLUMN "attempt2_percent" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "test_assignments" DROP CONSTRAINT "test_assignments_status_check";--> statement-breakpoint
ALTER TABLE "test_assignments" ADD CONSTRAINT "test_assignments_status_check" CHECK ("status" in ('assigned', 'in_progress', 'remaining_questions', 'attempt1_submitted', 'attempt2_in_progress', 'completed', 'reviewed', 'overdue'));--> statement-breakpoint
CREATE TABLE "test_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"score" numeric(10, 2),
	"max_score" numeric(10, 2),
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_score" numeric(10, 2),
	"manual_score" numeric(10, 2),
	"needs_manual_review" boolean DEFAULT false NOT NULL,
	"is_correct" boolean,
	"teacher_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_assignment_id_test_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."test_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_attempts_assignment_number_uidx" ON "test_attempts" USING btree ("assignment_id","attempt_number");--> statement-breakpoint
CREATE INDEX "test_attempts_assignment_idx" ON "test_attempts" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answers_attempt_question_uidx" ON "attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_number_check" CHECK ("attempt_number" in (1, 2));--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_status_check" CHECK ("status" in ('in_progress', 'submitted'));--> statement-breakpoint
INSERT INTO "test_attempts" (
  "id", "assignment_id", "attempt_number", "status", "score", "max_score",
  "submitted_at", "created_at", "updated_at"
)
SELECT
  'att1_' || a."id",
  a."id",
  1,
  CASE
    WHEN a."status" IN ('completed', 'reviewed') THEN 'submitted'
    WHEN a."status" IN ('in_progress', 'overdue') THEN 'in_progress'
    ELSE 'in_progress'
  END,
  a."score",
  a."max_score",
  a."completed_at",
  a."created_at",
  a."updated_at"
FROM "test_assignments" a
WHERE EXISTS (
  SELECT 1 FROM "assignment_answers" ans WHERE ans."assignment_id" = a."id"
)
OR a."status" IN ('in_progress', 'completed', 'reviewed', 'overdue');--> statement-breakpoint
INSERT INTO "attempt_answers" (
  "id", "attempt_id", "question_id", "payload", "auto_score", "manual_score",
  "needs_manual_review", "is_correct", "teacher_comment", "created_at", "updated_at"
)
SELECT
  'aa_' || ans."id",
  'att1_' || ans."assignment_id",
  ans."question_id",
  ans."payload",
  ans."auto_score",
  ans."manual_score",
  ans."needs_manual_review",
  ans."is_correct",
  ans."teacher_comment",
  ans."created_at",
  ans."updated_at"
FROM "assignment_answers" ans
WHERE EXISTS (
  SELECT 1 FROM "test_attempts" ta
  WHERE ta."id" = 'att1_' || ans."assignment_id"
);--> statement-breakpoint
INSERT INTO "lesson_schedules" (
  "id", "organization_id", "teacher_id", "subject", "weekdays", "start_time",
  "duration_min", "active_from", "active_until", "status", "created_at", "updated_at"
)
SELECT
  'sch_split_' || s."schedule_id" || '_' || s."student_id",
  sch."organization_id",
  sch."teacher_id",
  sch."subject",
  sch."weekdays",
  sch."start_time",
  sch."duration_min",
  sch."active_from",
  sch."active_until",
  sch."status",
  now(),
  now()
FROM "lesson_schedule_students" s
INNER JOIN "lesson_schedules" sch ON sch."id" = s."schedule_id"
INNER JOIN (
  SELECT "schedule_id", MIN("student_id") AS "keep_id"
  FROM "lesson_schedule_students"
  GROUP BY "schedule_id"
) k ON k."schedule_id" = s."schedule_id"
WHERE s."student_id" <> k."keep_id";--> statement-breakpoint
INSERT INTO "lesson_schedule_students" ("schedule_id", "student_id")
SELECT
  'sch_split_' || s."schedule_id" || '_' || s."student_id",
  s."student_id"
FROM "lesson_schedule_students" s
INNER JOIN (
  SELECT "schedule_id", MIN("student_id") AS "keep_id"
  FROM "lesson_schedule_students"
  GROUP BY "schedule_id"
) k ON k."schedule_id" = s."schedule_id"
WHERE s."student_id" <> k."keep_id";--> statement-breakpoint
DELETE FROM "lesson_schedule_students" s
USING (
  SELECT "schedule_id", MIN("student_id") AS "keep_id"
  FROM "lesson_schedule_students"
  GROUP BY "schedule_id"
) k
WHERE s."schedule_id" = k."schedule_id" AND s."student_id" <> k."keep_id";--> statement-breakpoint
INSERT INTO "lessons" (
  "id", "organization_id", "teacher_id", "topic_id", "schedule_id",
  "schedule_occurrence_key", "subject", "starts_at", "ends_at", "status",
  "created_at", "updated_at"
)
SELECT
  'l_split_' || ls."lesson_id" || '_' || ls."student_id",
  l."organization_id",
  l."teacher_id",
  l."topic_id",
  CASE
    WHEN l."schedule_id" IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM "lesson_schedules" s
      WHERE s."id" = 'sch_split_' || l."schedule_id" || '_' || ls."student_id"
    ) THEN 'sch_split_' || l."schedule_id" || '_' || ls."student_id"
    ELSE NULL
  END,
  l."schedule_occurrence_key",
  l."subject",
  l."starts_at",
  l."ends_at",
  l."status",
  now(),
  now()
FROM "lesson_students" ls
INNER JOIN "lessons" l ON l."id" = ls."lesson_id"
INNER JOIN (
  SELECT "lesson_id", MIN("student_id") AS "keep_id"
  FROM "lesson_students"
  GROUP BY "lesson_id"
) k ON k."lesson_id" = ls."lesson_id"
WHERE ls."student_id" <> k."keep_id";--> statement-breakpoint
INSERT INTO "lesson_students" ("lesson_id", "student_id")
SELECT
  'l_split_' || ls."lesson_id" || '_' || ls."student_id",
  ls."student_id"
FROM "lesson_students" ls
INNER JOIN (
  SELECT "lesson_id", MIN("student_id") AS "keep_id"
  FROM "lesson_students"
  GROUP BY "lesson_id"
) k ON k."lesson_id" = ls."lesson_id"
WHERE ls."student_id" <> k."keep_id";--> statement-breakpoint
UPDATE "attendances" AS a
SET "lesson_id" = 'l_split_' || a."lesson_id" || '_' || a."student_id"
WHERE EXISTS (
  SELECT 1 FROM "lessons" l
  WHERE l."id" = 'l_split_' || a."lesson_id" || '_' || a."student_id"
);--> statement-breakpoint
UPDATE "tariff_lesson_debit_state" AS d
SET "lesson_id" = 'l_split_' || d."lesson_id" || '_' || d."student_id"
WHERE EXISTS (
  SELECT 1 FROM "lessons" l
  WHERE l."id" = 'l_split_' || d."lesson_id" || '_' || d."student_id"
);--> statement-breakpoint
UPDATE "test_assignments" AS a
SET "lesson_id" = 'l_split_' || a."lesson_id" || '_' || a."student_id"
WHERE a."lesson_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "lessons" l
    WHERE l."id" = 'l_split_' || a."lesson_id" || '_' || a."student_id"
  );--> statement-breakpoint
DELETE FROM "lesson_students" ls
USING (
  SELECT "lesson_id", MIN("student_id") AS "keep_id"
  FROM "lesson_students"
  GROUP BY "lesson_id"
) k
WHERE ls."lesson_id" = k."lesson_id" AND ls."student_id" <> k."keep_id";
