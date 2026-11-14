-- Пробные уроки (Дирекция): nullable текстовое поле «Преподаватель».
-- Только ADD COLUMN — без пересоздания таблицы и без изменения существующих строк.

ALTER TABLE "manual_trial_lessons" ADD COLUMN IF NOT EXISTS "teacher" text;
