ALTER TABLE "students" DROP CONSTRAINT "students_status_check";--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_status_check" CHECK ("status" in ('active', 'paused', 'archived'));--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "archived_at" timestamptz;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "archived_reason" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "archived_comment" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "previous_teacher_id" text;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_archived_by_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_previous_teacher_fk" FOREIGN KEY ("previous_teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_archived_reason_check" CHECK ("archived_reason" is null or "archived_reason" in ('trial_not_continued', 'stopped', 'other'));--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" DROP CONSTRAINT "tll_reason_check";--> statement-breakpoint
ALTER TABLE "tariff_lesson_ledger" ADD CONSTRAINT "tll_reason_check" CHECK ("reason" in ('present', 'absent_unexcused', 'reversal', 'debt_settlement'));--> statement-breakpoint
CREATE UNIQUE INDEX "tll_debt_settlement_uidx" ON "tariff_lesson_ledger" ("assignment_id") WHERE "reason" = 'debt_settlement';
