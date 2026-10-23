ALTER TABLE "students" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "telegram" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "parent_contacts" text;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_grade_check" CHECK ("grade" is null or "grade" in ('8', '9', '10', '11'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_org_paid_at_idx" ON "payments" USING btree ("organization_id","paid_at");
