-- База (Дирекция): nullable текстовые поля Ученик / Родитель / Преподаватель.
-- Только ADD COLUMN — без пересоздания таблицы и без изменения существующих строк.
-- avito_url не затрагивается (отображаемое имя «Ссылка» меняется только в UI).

ALTER TABLE "base_leads" ADD COLUMN IF NOT EXISTS "student" text;
--> statement-breakpoint
ALTER TABLE "base_leads" ADD COLUMN IF NOT EXISTS "parent" text;
--> statement-breakpoint
ALTER TABLE "base_leads" ADD COLUMN IF NOT EXISTS "teacher" text;
