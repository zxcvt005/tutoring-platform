ALTER TABLE "teachers" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "bio" text;--> statement-breakpoint
CREATE TABLE "tariffs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"duration_days" integer NOT NULL,
	"lessons_limit" integer,
	"includes_text" text,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_tariff_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"tariff_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"price_snapshot" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assignment_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'stub' NOT NULL,
	"external_id" text,
	"idempotency_key" text NOT NULL,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "student_tariff_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "student_tariff_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "student_tariff_assignments_tariff_id_tariffs_id_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariffs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_assignment_id_student_tariff_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."student_tariff_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tariffs_org_idx" ON "tariffs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sta_org_student_idx" ON "student_tariff_assignments" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX "sta_tariff_idx" ON "student_tariff_assignments" USING btree ("tariff_id");--> statement-breakpoint
CREATE INDEX "payments_org_student_idx" ON "payments" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX "payments_assignment_idx" ON "payments" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uidx" ON "payments" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_status_check" CHECK ("status" in ('active', 'archived'));--> statement-breakpoint
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_currency_check" CHECK ("currency" in ('RUB'));--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "sta_status_check" CHECK ("status" in ('pending_payment', 'active', 'expired', 'cancelled', 'paused'));--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "sta_payment_status_check" CHECK ("payment_status" in ('unpaid', 'paid', 'refunded'));--> statement-breakpoint
ALTER TABLE "student_tariff_assignments" ADD CONSTRAINT "sta_time_check" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK ("status" in ('pending', 'paid', 'cancelled', 'failed'));
