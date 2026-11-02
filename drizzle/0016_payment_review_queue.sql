ALTER TABLE "students" ADD COLUMN "purchase_tariff_id" text;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_purchase_tariff_fk" FOREIGN KEY ("purchase_tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" DROP CONSTRAINT "sta_status_check";--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "sta_status_check" CHECK ("status" in ('pending_payment', 'active', 'queued', 'expired', 'cancelled', 'paused'));--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_status_check";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK ("status" in ('pending', 'paid', 'cancelled', 'failed', 'rejected'));--> statement-breakpoint
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY organization_id, student_id
    ORDER BY created_at DESC, id DESC
  ) AS rn
  FROM payments
  WHERE status = 'pending'
)
UPDATE payments SET status = 'cancelled', updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending_student_uidx" ON "payments" ("organization_id", "student_id") WHERE "status" = 'pending';--> statement-breakpoint
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY organization_id, student_id
    ORDER BY starts_at DESC, id DESC
  ) AS rn
  FROM student_tariff_assignments
  WHERE status = 'active' AND payment_status = 'paid'
)
UPDATE student_tariff_assignments SET status = 'expired', updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "sta_one_active_paid_uidx" ON "student_tariff_assignments" ("organization_id", "student_id") WHERE "status" = 'active' AND "payment_status" = 'paid';--> statement-breakpoint
UPDATE students s SET purchase_tariff_id = (
  SELECT a.tariff_id FROM student_tariff_assignments a
  WHERE a.student_id = s.id
  ORDER BY
    CASE WHEN a.status = 'active' AND a.payment_status = 'paid' THEN 0 ELSE 1 END,
    a.starts_at DESC
  LIMIT 1
) WHERE s.purchase_tariff_id IS NULL;
