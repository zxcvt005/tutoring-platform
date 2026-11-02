CREATE TABLE "teacher_pay_rates" (
	"teacher_id" text NOT NULL,
	"present_count" integer NOT NULL,
	"amount_kopecks" integer NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_pay_rates_teacher_id_present_count_pk" PRIMARY KEY("teacher_id","present_count")
);--> statement-breakpoint
CREATE TABLE "teacher_payroll_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"slot_date" text NOT NULL,
	"slot_start_time" text NOT NULL,
	"slot_starts_at" timestamp with time zone NOT NULL,
	"canonical_lesson_id" text,
	"lesson_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attendance_closed" boolean DEFAULT false NOT NULL,
	"present_count" integer,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "teacher_payroll_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"slot_id" text,
	"entry_type" text NOT NULL,
	"amount_kopecks" integer NOT NULL,
	"present_count" integer,
	"applied_rate_kopecks" integer,
	"rates_snapshot" jsonb,
	"explanation" text NOT NULL,
	"comment" text,
	"lesson_ids" jsonb,
	"slot_date" text,
	"slot_start_time" text,
	"slot_starts_at" timestamp with time zone,
	"canonical_lesson_id" text,
	"actor_user_id" text,
	"idempotency_key" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "teacher_pay_rates" ADD CONSTRAINT "teacher_pay_rates_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_pay_rates" ADD CONSTRAINT "teacher_pay_rates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_payroll_slots" ADD CONSTRAINT "teacher_payroll_slots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_payroll_slots" ADD CONSTRAINT "teacher_payroll_slots_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_payroll_entries" ADD CONSTRAINT "teacher_payroll_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_payroll_entries" ADD CONSTRAINT "teacher_payroll_entries_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_payroll_entries" ADD CONSTRAINT "teacher_payroll_entries_slot_id_teacher_payroll_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."teacher_payroll_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_payroll_entries" ADD CONSTRAINT "teacher_payroll_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_pay_rates" ADD CONSTRAINT "teacher_pay_rates_count_check" CHECK ("present_count" between 1 and 5);--> statement-breakpoint
ALTER TABLE "teacher_pay_rates" ADD CONSTRAINT "teacher_pay_rates_amount_check" CHECK ("amount_kopecks" >= 0);--> statement-breakpoint
ALTER TABLE "teacher_payroll_slots" ADD CONSTRAINT "tps_blocked_reason_check" CHECK ("blocked_reason" is null or "blocked_reason" in ('rates_not_configured', 'rate_missing_for_count', 'present_count_out_of_range'));--> statement-breakpoint
ALTER TABLE "teacher_payroll_slots" ADD CONSTRAINT "tps_present_count_check" CHECK ("present_count" is null or "present_count" >= 0);--> statement-breakpoint
ALTER TABLE "teacher_payroll_entries" ADD CONSTRAINT "tpe_type_check" CHECK ("entry_type" in ('accrual', 'adjustment', 'payout'));--> statement-breakpoint
ALTER TABLE "teacher_payroll_entries" ADD CONSTRAINT "tpe_amount_check" CHECK (
  ("entry_type" = 'accrual' and "amount_kopecks" >= 0) or
  ("entry_type" = 'adjustment' and "amount_kopecks" <> 0) or
  ("entry_type" = 'payout' and "amount_kopecks" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "tps_teacher_slot_uidx" ON "teacher_payroll_slots" USING btree ("teacher_id","slot_date","slot_start_time");--> statement-breakpoint
CREATE INDEX "tps_org_teacher_idx" ON "teacher_payroll_slots" USING btree ("organization_id","teacher_id");--> statement-breakpoint
CREATE INDEX "tps_org_starts_idx" ON "teacher_payroll_slots" USING btree ("organization_id","slot_starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tpe_accrual_slot_uidx" ON "teacher_payroll_entries" USING btree ("slot_id") WHERE "entry_type" = 'accrual';--> statement-breakpoint
CREATE UNIQUE INDEX "tpe_idempotency_uidx" ON "teacher_payroll_entries" USING btree ("organization_id","idempotency_key") WHERE "idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "tpe_teacher_occurred_idx" ON "teacher_payroll_entries" USING btree ("teacher_id","occurred_at","created_at","id");--> statement-breakpoint
CREATE INDEX "tpe_org_occurred_idx" ON "teacher_payroll_entries" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tpe_slot_idx" ON "teacher_payroll_entries" USING btree ("slot_id");
