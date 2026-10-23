ALTER TABLE "tariffs" ADD COLUMN "weekly_frequency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD COLUMN "lessons_limit_snapshot" integer;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD COLUMN "weekly_frequency_snapshot" integer;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD COLUMN "duration_days_snapshot" integer;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD COLUMN "tariff_name_snapshot" text;--> statement-breakpoint
UPDATE "student_tariff_assignments" AS a
SET
  "lessons_limit_snapshot" = t."lessons_limit",
  "weekly_frequency_snapshot" = t."weekly_frequency",
  "duration_days_snapshot" = t."duration_days",
  "tariff_name_snapshot" = t."name"
FROM "tariffs" AS t
WHERE t."id" = a."tariff_id";--> statement-breakpoint
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_status_check";--> statement-breakpoint
UPDATE "attendances" SET "status" = 'absent_unexcused' WHERE "status" = 'absent';--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_status_check" CHECK ("status" in ('present', 'absent_excused', 'absent_unexcused', 'cancelled', 'rescheduled'));--> statement-breakpoint
CREATE TABLE "tariff_lesson_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"assignment_id" text NOT NULL,
	"lesson_id" text,
	"student_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"attendance_status" text,
	"supersedes_id" text,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "tariff_lesson_debit_state" (
	"lesson_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assignment_id" text NOT NULL,
	"ledger_entry_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tariff_lesson_debit_state_lesson_id_student_id_pk" PRIMARY KEY("lesson_id","student_id")
);--> statement-breakpoint
CREATE TABLE "lesson_schedule_exceptions" (
	"schedule_id" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"reason" text NOT NULL,
	"lesson_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_schedule_exceptions_schedule_id_occurrence_key_pk" PRIMARY KEY("schedule_id","occurrence_key")
);--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tariff_lesson_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tariff_lesson_ledger_assignment_id_student_tariff_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."student_tariff_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tariff_lesson_ledger_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tariff_lesson_ledger_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tariff_lesson_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_debit_state" ADD CONSTRAINT "tariff_lesson_debit_state_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_debit_state" ADD CONSTRAINT "tariff_lesson_debit_state_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_debit_state" ADD CONSTRAINT "tariff_lesson_debit_state_assignment_id_student_tariff_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."student_tariff_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_lesson_debit_state" ADD CONSTRAINT "tariff_lesson_debit_state_ledger_entry_id_tariff_lesson_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."tariff_lesson_ledger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedule_exceptions" ADD CONSTRAINT "lesson_schedule_exceptions_schedule_id_lesson_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."lesson_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tll_assignment_idx" ON "tariff_lesson_ledger" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "tll_lesson_student_idx" ON "tariff_lesson_ledger" USING btree ("lesson_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tlds_ledger_uidx" ON "tariff_lesson_debit_state" USING btree ("ledger_entry_id");--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tll_delta_check" CHECK ("delta" in (-1, 1));--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tll_reason_check" CHECK ("reason" in ('present', 'absent_unexcused', 'reversal'));--> statement-breakpoint
ALTER TABLE "lesson_schedule_exceptions" ADD CONSTRAINT "lse_reason_check" CHECK ("reason" in ('deleted', 'moved', 'cancelled'));--> statement-breakpoint
INSERT INTO "tariff_lesson_ledger" (
  "id", "organization_id", "assignment_id", "lesson_id", "student_id",
  "delta", "reason", "attendance_status"
)
SELECT
  'led_mig_' || a."lesson_id" || '_' || a."student_id",
  l."organization_id",
  sta."id",
  a."lesson_id",
  a."student_id",
  -1,
  CASE WHEN a."status" = 'present' THEN 'present' ELSE 'absent_unexcused' END,
  a."status"
FROM "attendances" a
INNER JOIN "lessons" l ON l."id" = a."lesson_id"
INNER JOIN LATERAL (
  SELECT s."id"
  FROM "student_tariff_assignments" s
  WHERE s."student_id" = a."student_id"
    AND s."organization_id" = l."organization_id"
    AND s."payment_status" = 'paid'
    AND s."starts_at" <= l."starts_at"
  ORDER BY s."starts_at" DESC
  LIMIT 1
) sta ON true
WHERE a."status" IN ('present', 'absent_unexcused')
  AND l."status" IS DISTINCT FROM 'cancelled';--> statement-breakpoint
INSERT INTO "tariff_lesson_debit_state" (
  "lesson_id", "student_id", "assignment_id", "ledger_entry_id"
)
SELECT
  l."lesson_id",
  l."student_id",
  l."assignment_id",
  l."id"
FROM "tariff_lesson_ledger" l
WHERE l."delta" = -1
  AND l."lesson_id" IS NOT NULL
ON CONFLICT ("lesson_id", "student_id") DO NOTHING;
