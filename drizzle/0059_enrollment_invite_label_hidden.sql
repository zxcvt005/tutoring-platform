-- Внутренняя подпись и скрытие enrollment-приглашений учеников.
-- Скрытие не отзывает ссылку и не удаляет приглашение.

ALTER TABLE "account_invitations"
  ADD COLUMN IF NOT EXISTS "invite_label" text;--> statement-breakpoint

ALTER TABLE "account_invitations"
  ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "account_invitations_org_hidden_idx"
  ON "account_invitations" ("organization_id", "hidden_at");
