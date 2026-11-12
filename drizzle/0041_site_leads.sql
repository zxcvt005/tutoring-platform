-- Заявки с публичного лендинга (Дирекция → Заявки).
-- Не создаёт учеников, занятия и оплаты автоматически.

CREATE TABLE IF NOT EXISTS "site_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_name" text NOT NULL,
	"grade" text NOT NULL,
	"level" text DEFAULT '' NOT NULL,
	"parent_name" text NOT NULL,
	"contact" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Новая' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "site_leads"
    ADD CONSTRAINT "site_leads_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "site_leads"
    ADD CONSTRAINT "site_leads_status_check"
    CHECK (
      "status" in ('Новая', 'Написали', 'Диагностика', 'Отказ', 'Зачислили')
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "site_leads"
    ADD CONSTRAINT "site_leads_grade_check"
    CHECK ("grade" in ('10', '11', 'other'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_leads_org_idx"
  ON "site_leads" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_leads_org_created_idx"
  ON "site_leads" USING btree ("organization_id","created_at");
