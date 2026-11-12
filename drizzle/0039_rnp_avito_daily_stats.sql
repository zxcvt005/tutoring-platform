-- Ежедневная статистика «РНП Авито» (Дирекция).
-- Изолированная таблица: не связана с base_leads, manual_trial_lessons, учениками.
-- Не запускать на Production без явного разрешения.

CREATE TABLE IF NOT EXISTS "rnp_avito_daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"day_date" text NOT NULL,
	"budget_spent_rub" integer,
	"impressions" integer,
	"views" integer,
	"contacts" integer,
	"api_synced_at" timestamp with time zone,
	"trials_scheduled" integer,
	"trials_completed" integer,
	"manual_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rnp_avito_daily_stats"
    ADD CONSTRAINT "rnp_avito_daily_stats_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rnp_avito_daily_stats"
    ADD CONSTRAINT "rnp_avito_daily_date_check"
    CHECK ("day_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rnp_avito_daily_stats"
    ADD CONSTRAINT "rnp_avito_daily_nonneg_check"
    CHECK (
      ("budget_spent_rub" is null or "budget_spent_rub" >= 0)
      and ("impressions" is null or "impressions" >= 0)
      and ("views" is null or "views" >= 0)
      and ("contacts" is null or "contacts" >= 0)
      and ("trials_scheduled" is null or "trials_scheduled" >= 0)
      and ("trials_completed" is null or "trials_completed" >= 0)
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rnp_avito_daily_org_date_uidx"
  ON "rnp_avito_daily_stats" USING btree ("organization_id","day_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rnp_avito_daily_org_idx"
  ON "rnp_avito_daily_stats" USING btree ("organization_id");
