-- Предварительное назначение каталожного тарифа ученику (для оплаты).
-- NULL = ученик видит все активные тарифы школы (постепенное внедрение).

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "assigned_tariff_id" text;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_assigned_tariff_id_tariffs_id_fk"
  FOREIGN KEY ("assigned_tariff_id") REFERENCES "public"."tariffs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "students_assigned_tariff_idx"
  ON "students" ("assigned_tariff_id");
