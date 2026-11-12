-- Ручные и автоматические расходы Дирекции.
-- Изолированная таблица: не связана с CRM, учениками, занятиями и заявками.
-- Автозаписи Avito/зарплат отличаются source + external_id.
-- Не запускать на Production без явного разрешения.

CREATE TABLE IF NOT EXISTS "director_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"expense_date" text NOT NULL,
	"amount_rub" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_expenses"
    ADD CONSTRAINT "director_expenses_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_expenses"
    ADD CONSTRAINT "director_expenses_category_check"
    CHECK (
      "category" in ('Авито', 'Профи', 'Зарплата', 'Сервисы', 'Налоги', 'Подарки')
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_expenses"
    ADD CONSTRAINT "director_expenses_source_check"
    CHECK ("source" in ('manual', 'avito', 'salary'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_expenses"
    ADD CONSTRAINT "director_expenses_date_check"
    CHECK ("expense_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_expenses"
    ADD CONSTRAINT "director_expenses_amount_check"
    CHECK ("amount_rub" > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "director_expenses"
    ADD CONSTRAINT "director_expenses_external_check"
    CHECK (
      ("source" = 'manual' and "external_id" is null)
      or ("source" <> 'manual' and "external_id" is not null)
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- PostgreSQL: NULL в external_id не конфликтуют между собой (ручные записи).
CREATE UNIQUE INDEX IF NOT EXISTS "director_expenses_org_source_ext_uidx"
  ON "director_expenses" USING btree ("organization_id","source","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "director_expenses_org_date_idx"
  ON "director_expenses" USING btree ("organization_id","expense_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "director_expenses_org_category_idx"
  ON "director_expenses" USING btree ("organization_id","category");
