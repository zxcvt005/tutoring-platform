-- Commerce rewrite: directions, purchase options, orders, direction-scoped ledger.
-- ВНИМАНИЕ: разрушительная для старой коммерции миграция.
-- Удаляет: tariff_lesson_debit_state, tariff_lesson_ledger, payments,
-- student_tariff_assignments, все строки tariffs/tariff_products,
-- students.purchase_tariff_id.
-- Ученики, уроки, посещаемость, ДЗ, payroll и прочие модули не удаляются.
-- Рассчитано на отсутствие реальных оплаченных абонементов в Production.

DROP TABLE IF EXISTS "tariff_lesson_debit_state" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tariff_lesson_ledger" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "payments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "student_tariff_assignments" CASCADE;--> statement-breakpoint
DELETE FROM "tariff_products";--> statement-breakpoint
DELETE FROM "tariffs";--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_purchase_tariff_fk";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN IF EXISTS "purchase_tariff_id";--> statement-breakpoint
CREATE TABLE "learning_directions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "learning_directions" ADD CONSTRAINT "learning_directions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_directions_org_slug_uidx" ON "learning_directions" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "learning_directions_org_idx" ON "learning_directions" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "learning_directions" ADD CONSTRAINT "learning_directions_status_check" CHECK ("status" in ('active', 'archived'));--> statement-breakpoint
INSERT INTO "learning_directions" ("id", "organization_id", "name", "slug", "status", "created_at", "updated_at")
SELECT 'ldir_physics_' || "id", "id", 'Физика', 'physics', 'active', now(), now()
FROM "organizations"
WHERE NOT EXISTS (
  SELECT 1 FROM "learning_directions" d
  WHERE d."organization_id" = "organizations"."id" AND d."slug" = 'physics'
);--> statement-breakpoint
INSERT INTO "learning_directions" ("id", "organization_id", "name", "slug", "status", "created_at", "updated_at")
SELECT 'ldir_math_' || "id", "id", 'Математика', 'math', 'active', now(), now()
FROM "organizations"
WHERE NOT EXISTS (
  SELECT 1 FROM "learning_directions" d
  WHERE d."organization_id" = "organizations"."id" AND d."slug" = 'math'
);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "duration_days" DROP NOT NULL;--> statement-breakpoint
-- Таблица tariffs уже очищена выше — NOT NULL без default безопасен.
ALTER TABLE "tariffs" ADD COLUMN "direction_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_direction_id_learning_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."learning_directions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tariffs_direction_idx" ON "tariffs" USING btree ("direction_id");--> statement-breakpoint
CREATE TABLE "tariff_purchase_options" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tariff_id" text NOT NULL,
	"lessons_count" integer NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "tariff_purchase_options" ADD CONSTRAINT "tariff_purchase_options_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_purchase_options" ADD CONSTRAINT "tariff_purchase_options_tariff_id_tariffs_id_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_purchase_options_tariff_lessons_uidx" ON "tariff_purchase_options" USING btree ("tariff_id","lessons_count");--> statement-breakpoint
CREATE INDEX "tariff_purchase_options_tariff_idx" ON "tariff_purchase_options" USING btree ("tariff_id");--> statement-breakpoint
CREATE INDEX "tariff_purchase_options_org_idx" ON "tariff_purchase_options" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "tariff_purchase_options" ADD CONSTRAINT "tariff_purchase_options_lessons_check" CHECK ("lessons_count" > 0);--> statement-breakpoint
CREATE TABLE "lesson_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payer_user_id" text NOT NULL,
	"student_id" text NOT NULL,
	"tariff_id" text NOT NULL,
	"option_id" text,
	"direction_id" text NOT NULL,
	"tariff_name_snapshot" text NOT NULL,
	"lessons_count" integer NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"features_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_ids_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"paid_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"credit_ledger_entry_id" text,
	"access_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_tariff_id_tariffs_id_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariffs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_option_id_tariff_purchase_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."tariff_purchase_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_direction_id_learning_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."learning_directions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_orders_org_student_idx" ON "lesson_orders" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX "lesson_orders_org_status_idx" ON "lesson_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "lesson_orders_direction_idx" ON "lesson_orders" USING btree ("direction_id");--> statement-breakpoint
CREATE INDEX "lesson_orders_tariff_idx" ON "lesson_orders" USING btree ("tariff_id");--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_status_check" CHECK ("status" in ('awaiting_payment', 'paid', 'cancelled', 'expired', 'refunded', 'disputed'));--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_currency_check" CHECK ("currency" in ('RUB'));--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_lessons_check" CHECK ("lessons_count" > 0);--> statement-breakpoint
CREATE TABLE "student_lesson_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"direction_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"lesson_id" text,
	"order_id" text,
	"supersedes_id" text,
	"actor_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "student_lesson_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "student_lesson_ledger_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "student_lesson_ledger_direction_id_learning_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."learning_directions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "student_lesson_ledger_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "student_lesson_ledger_order_id_lesson_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."lesson_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "student_lesson_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sll_org_student_direction_idx" ON "student_lesson_ledger" USING btree ("organization_id","student_id","direction_id");--> statement-breakpoint
CREATE INDEX "sll_lesson_student_idx" ON "student_lesson_ledger" USING btree ("lesson_id","student_id");--> statement-breakpoint
CREATE INDEX "sll_order_idx" ON "student_lesson_ledger" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sll_purchase_per_order_uidx" ON "student_lesson_ledger" USING btree ("order_id") WHERE "reason" = 'purchase';--> statement-breakpoint
CREATE UNIQUE INDEX "sll_refund_clawback_per_order_uidx" ON "student_lesson_ledger" USING btree ("order_id") WHERE "reason" = 'refund_clawback';--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "sll_delta_check" CHECK ("delta" <> 0);--> statement-breakpoint
ALTER TABLE "student_lesson_ledger" ADD CONSTRAINT "sll_reason_check" CHECK ("reason" in ('purchase', 'present', 'absent_unexcused', 'reversal', 'manual_adjustment', 'refund_clawback'));--> statement-breakpoint
ALTER TABLE "lesson_orders" ADD CONSTRAINT "lesson_orders_credit_ledger_entry_id_student_lesson_ledger_id_fk" FOREIGN KEY ("credit_ledger_entry_id") REFERENCES "public"."student_lesson_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'stub' NOT NULL,
	"external_id" text,
	"payment_link_id" text,
	"idempotency_key" text NOT NULL,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_lesson_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."lesson_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_org_student_idx" ON "payments" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_org_paid_at_idx" ON "payments" USING btree ("organization_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uidx" ON "payments" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_id_uidx" ON "payments" USING btree ("external_id") WHERE "external_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_link_id_uidx" ON "payments" USING btree ("payment_link_id") WHERE "payment_link_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending_order_uidx" ON "payments" USING btree ("order_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK ("status" in ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded'));--> statement-breakpoint
CREATE TABLE "lesson_debit_state" (
	"lesson_id" text NOT NULL,
	"student_id" text NOT NULL,
	"direction_id" text NOT NULL,
	"ledger_entry_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_debit_state_lesson_id_student_id_pk" PRIMARY KEY("lesson_id","student_id")
);--> statement-breakpoint
ALTER TABLE "lesson_debit_state" ADD CONSTRAINT "lesson_debit_state_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_debit_state" ADD CONSTRAINT "lesson_debit_state_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_debit_state" ADD CONSTRAINT "lesson_debit_state_direction_id_learning_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."learning_directions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_debit_state" ADD CONSTRAINT "lesson_debit_state_ledger_entry_id_student_lesson_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."student_lesson_ledger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lds_ledger_uidx" ON "lesson_debit_state" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE INDEX "lds_direction_idx" ON "lesson_debit_state" USING btree ("direction_id");--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "direction_id" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_direction_id_learning_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."learning_directions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD COLUMN "direction_id" text;--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD CONSTRAINT "lesson_schedules_direction_id_learning_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."learning_directions"("id") ON DELETE set null ON UPDATE no action;