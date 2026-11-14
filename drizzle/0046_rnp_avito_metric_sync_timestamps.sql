-- РНП Авито: раздельные метки успешной синхронизации расходов и item-метрик.
-- Безопасно: только ADD COLUMN + backfill из api_synced_at. Данные не удаляем.

ALTER TABLE "rnp_avito_daily_stats"
  ADD COLUMN IF NOT EXISTS "budget_api_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "rnp_avito_daily_stats"
  ADD COLUMN IF NOT EXISTS "items_api_synced_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "rnp_avito_daily_stats"
SET
  "budget_api_synced_at" = COALESCE("budget_api_synced_at", "api_synced_at"),
  "items_api_synced_at" = COALESCE("items_api_synced_at", "api_synced_at")
WHERE "api_synced_at" IS NOT NULL;
