-- Ручная «База» потенциальных учеников (Дирекция).
-- Изолированная таблица: не связана с учениками, заявками, занятиями и продажами.
-- Не запускать на Production без явного разрешения.

CREATE TABLE IF NOT EXISTS "base_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entry_date" text NOT NULL,
	"source" text,
	"status" text,
	"name" text DEFAULT '' NOT NULL,
	"avito_url" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"path_1" boolean DEFAULT false NOT NULL,
	"path_2" boolean DEFAULT false NOT NULL,
	"path_3" boolean DEFAULT false NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"reconciliation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "base_leads"
    ADD CONSTRAINT "base_leads_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "base_leads"
    ADD CONSTRAINT "base_leads_source_check"
    CHECK (
      "source" is null
      or "source" in ('Профи', 'Авито', 'Реклама', 'Сарафан', 'Блог')
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "base_leads"
    ADD CONSTRAINT "base_leads_status_check"
    CHECK (
      "status" is null
      or "status" in (
        'Получен контакт',
        'Игнор',
        'Назначен пробный',
        'Проведен пробный',
        'Отказ',
        'Отказище',
        'Купил'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "base_leads"
    ADD CONSTRAINT "base_leads_entry_date_check"
    CHECK ("entry_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "base_leads_org_idx"
  ON "base_leads" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "base_leads_org_created_idx"
  ON "base_leads" USING btree ("organization_id","created_at");
