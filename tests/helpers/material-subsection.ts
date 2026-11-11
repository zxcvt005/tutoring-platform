import type { FolderContentKind } from "@/lib/folders/material-folders";
import type { AuthContext } from "@/server/authz/context";
import { upsertMaterialFolder } from "@/server/services/folder-service";
import type { AppDb } from "@/server/db/types";

/** Корневой раздел + подраздел для тестов, где сущность нельзя класть в корень. */
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
