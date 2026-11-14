-- РНП Авито: независимые флаги ручного переопределения пробных по ячейке.
-- Только ADD COLUMN с DEFAULT false — существующие строки остаются automatic.
-- Значения trials_scheduled / trials_completed не трогаем.

ALTER TABLE "rnp_avito_daily_stats"
  ADD COLUMN IF NOT EXISTS "trials_scheduled_is_manual" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "rnp_avito_daily_stats"
  ADD COLUMN IF NOT EXISTS "trials_completed_is_manual" boolean DEFAULT false NOT NULL;
