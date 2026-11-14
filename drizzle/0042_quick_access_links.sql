-- Секретные ссылки быстрого доступа к таблицам Дирекции.
-- В URL — сырой токен; в БД — sha256(token). Без логина; org и тип таблицы фиксируются записью.

CREATE TABLE IF NOT EXISTS "quick_access_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"access_type" text NOT NULL,
	"token_hash" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "quick_access_links"
    ADD CONSTRAINT "quick_access_links_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "quick_access_links"
    ADD CONSTRAINT "quick_access_links_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "quick_access_links"
    ADD CONSTRAINT "quick_access_links_type_check"
    CHECK (
      "access_type" in ('baza', 'rnp-avito', 'probnye-uroki', 'rashody')
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quick_access_links_token_hash_uidx"
  ON "quick_access_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quick_access_links_org_type_uidx"
  ON "quick_access_links" USING btree ("organization_id","access_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quick_access_links_org_idx"
  ON "quick_access_links" USING btree ("organization_id");
