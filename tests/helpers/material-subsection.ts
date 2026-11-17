import type { FolderContentKind } from "@/lib/folders/material-folders";
import type { AuthContext } from "@/server/authz/context";
import { upsertMaterialFolder } from "@/server/services/folder-service";
import type { AppDb } from "@/server/db/types";

/** Корневой раздел + вложенная папка для сценариев с несколькими уровнями. */
export async function ensureTeacherSubsection(
  db: AppDb,
  ctx: AuthContext,
  contentKind: Exclude<FolderContentKind, "shared"> = "topic"
) {
  const teacherId = ctx.teacherId;
  if (!teacherId) throw new Error("teacherId required");
  const root = await upsertMaterialFolder(db, ctx, {
    title: `Раздел ${contentKind}`,
    ownerScope: "teacher",
    teacherId,
    contentKind,
  });
  const sub = await upsertMaterialFolder(db, ctx, {
    title: `Подраздел ${contentKind}`,
    ownerScope: "teacher",
    teacherId,
    parentId: root.id,
    contentKind,
  });
  return { root, sub, folderId: sub.id };
}

/** Школьные папки базы знаний: раздел + подраздел. */
export async function ensureSchoolSubsection(
  db: AppDb,
  ctx: AuthContext,
  contentKind: Exclude<FolderContentKind, "shared"> = "topic"
) {
  const root = await upsertMaterialFolder(db, ctx, {
    title: `Школа · раздел ${contentKind}`,
    ownerScope: "school",
    teacherId: null,
    contentKind,
  });
  const sub = await upsertMaterialFolder(db, ctx, {
    title: `Школа · подраздел ${contentKind}`,
    ownerScope: "school",
    teacherId: null,
    parentId: root.id,
    contentKind,
  });
  return { root, sub, folderId: sub.id };
}
