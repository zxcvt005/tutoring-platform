-- Detach retained finance from deleted students:
-- nullable student_id / payer_user_id + name snapshots for audit history.

ALTER TABLE "lesson_orders" ADD COLUMN "student_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD COLUMN "payer_name_snapshot" text;--> statement-breakpoint
UPDATE "lesson_orders" AS o
SET "student_name_snapshot" = s."full_name"
FROM "students" AS s
WHERE s."id" = o."student_id"
  AND (o."student_name_snapshot" IS NULL OR o."student_name_snapshot" = '');--> statement-breakpoint
UPDATE "lesson_orders" AS o
SET "payer_name_snapshot" = u."full_name"
FROM "users" AS u
WHERE u."id" = o."payer_user_id"
  AND (o."payer_name_snapshot" IS NULL OR o."payer_name_snapshot" = '');--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN "student_name_snapshot" text;--> statement-breakpoint
UPDATE "payments" AS p
SET "student_name_snapshot" = s."full_name"
FROM "students" AS s
WHERE s."id" = p."student_id"
  AND (p."student_name_snapshot" IS NULL OR p."student_name_snapshot" = '');--> statement-breakpoint

ALTER TABLE "lesson_orders" DROP CONSTRAINT "lesson_orders_student_id_students_id_fk";--> statement-breakpoint
ALTER TABLE "lesson_orders" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "lesson_orders" DROP CONSTRAINT "lesson_orders_payer_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "lesson_orders" ALTER COLUMN "payer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "payments" DROP CONSTRAINT "payments_student_id_students_id_fk";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
