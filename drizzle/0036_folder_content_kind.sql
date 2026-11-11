-- Раздельные деревья папок по типу контента (темы / теория / тесты / интенсивы).
-- Безопасно и идемпотентно: существующие данные не удаляются.
-- Не запускать на Production без явного разрешения.

ALTER TABLE "material_folders"
  ADD COLUMN IF NOT EXISTS "content_kind" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "material_folders"
    ADD CONSTRAINT "material_folders_content_kind_check"
    CHECK (
      "content_kind" is null
      or "content_kind" in ('topic', 'theory', 'test', 'intensive', 'shared')
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Пометить папки по фактическому содержимому (если однородны).
UPDATE "material_folders" AS f
SET "content_kind" = 'topic',
    "updated_at" = now()
WHERE f."content_kind" is null
  AND EXISTS (
    SELECT 1 FROM "topics" t WHERE t."folder_id" = f."id"
  )
  AND NOT EXISTS (SELECT 1 FROM "tests" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "theory_materials" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "intensives" x WHERE x."folder_id" = f."id");
--> statement-breakpoint
UPDATE "material_folders" AS f
SET "content_kind" = 'test',
    "updated_at" = now()
WHERE f."content_kind" is null
  AND EXISTS (SELECT 1 FROM "tests" t WHERE t."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "topics" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "theory_materials" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "intensives" x WHERE x."folder_id" = f."id");
--> statement-breakpoint
UPDATE "material_folders" AS f
SET "content_kind" = 'theory',
    "updated_at" = now()
WHERE f."content_kind" is null
  AND EXISTS (SELECT 1 FROM "theory_materials" t WHERE t."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "topics" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "tests" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "intensives" x WHERE x."folder_id" = f."id");
--> statement-breakpoint
UPDATE "material_folders" AS f
SET "content_kind" = 'intensive',
    "updated_at" = now()
WHERE f."content_kind" is null
  AND EXISTS (SELECT 1 FROM "intensives" t WHERE t."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "topics" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "tests" x WHERE x."folder_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "theory_materials" x WHERE x."folder_id" = f."id");
--> statement-breakpoint
-- Пустые вложенные папки наследуют тип предка (чтобы не становиться shared
-- внутри уже типизированного дерева и не «протекать» в чужие разделы).
WITH RECURSIVE typed AS (
  SELECT id, content_kind
  FROM material_folders
  WHERE content_kind in ('topic', 'theory', 'test', 'intensive')
  UNION ALL
  SELECT c.id, typed.content_kind
  FROM material_folders c
  INNER JOIN typed ON c.parent_id = typed.id
  WHERE c.content_kind is null
)
UPDATE material_folders AS f
SET content_kind = typed.content_kind,
    updated_at = now()
FROM typed
WHERE f.id = typed.id
  AND f.content_kind is null;
--> statement-breakpoint
-- Смешанные / пустые корни и прочее наследие — shared (видны во всех разделах до разборки).
UPDATE "material_folders"
SET "content_kind" = 'shared',
    "updated_at" = now()
WHERE "content_kind" is null;
