import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { newId } from "@/lib/format";
import {
  buildFolderBreadcrumbs,
  collectFolderDescendantIds,
  wouldCreateFolderCycle,
  type FolderSpace,
  type MaterialFolder,
  type MaterialFolderKind,
} from "@/lib/folders/material-folders";
import { canManageSchoolKnowledgeBase } from "@/lib/auth/school-knowledge";
import type { AuthContext } from "@/server/authz/context";
import {
  assertDirectorSeesTeacher,
  requireRoles,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  intensives,
  materialFolders,
  students,
  tests,
  theoryMaterials,
  topicSections,
  topics,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound, validationError } from "@/server/errors";

function mapFolder(row: typeof materialFolders.$inferSelect): MaterialFolder {
  return {
    id: row.id,
    ownerScope: row.ownerScope === "school" ? "school" : "teacher",
    teacherId: row.teacherId,
    parentId: row.parentId,
    title: row.title,
    sortOrder: row.sortOrder,
  };
}

async function loadOrgFolders(db: AppDb, organizationId: string) {
  return db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.organizationId, organizationId));
}

function spaceWhere(space: FolderSpace, organizationId: string) {
  if (space.ownerScope === "school") {
    return and(
      eq(materialFolders.organizationId, organizationId),
      eq(materialFolders.ownerScope, "school"),
      isNull(materialFolders.teacherId)
    );
  }
  if (!space.teacherId) throw badRequest("Нужен teacherId для пространства преподавателя");
  return and(
    eq(materialFolders.organizationId, organizationId),
    eq(materialFolders.ownerScope, "teacher"),
    eq(materialFolders.teacherId, space.teacherId)
  );
}

async function assertCanManageSpace(db: AppDb, ctx: AuthContext, space: FolderSpace) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);
  if (space.ownerScope === "school") {
    if (!canManageSchoolKnowledgeBase(ctx.role)) throw forbidden();
    return;
  }
  if (!space.teacherId) throw badRequest("Нужен teacherId");
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (space.teacherId !== tid) throw forbidden();
    return;
  }
  await assertDirectorSeesTeacher(db, ctx, space.teacherId);
}

async function assertCanReadSpace(db: AppDb, ctx: AuthContext, space: FolderSpace) {
  if (space.ownerScope === "school") {
    // Школьная БЗ через API — только staff и преподаватели (не ученики).
    requireRoles(ctx, ["teacher", "director", "assistant"]);
    return;
  }
  requireRoles(ctx, ["teacher", "director", "assistant", "student"]);
  if (!space.teacherId) throw badRequest("Нужен teacherId");
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (space.teacherId !== tid) throw forbidden();
    return;
  }
  if (ctx.role === "director" || ctx.role === "assistant") {
    await assertDirectorSeesTeacher(db, ctx, space.teacherId);
    return;
  }
  if (ctx.role === "student") {
    if (!ctx.studentId) throw forbidden();
    const [student] = await db
      .select({ primaryTeacherId: students.primaryTeacherId })
      .from(students)
      .where(eq(students.id, ctx.studentId))
      .limit(1);
    if (!student || student.primaryTeacherId !== space.teacherId) {
      throw forbidden();
    }
  }
}

async function getFolderOrThrow(db: AppDb, ctx: AuthContext, id: string) {
  const [row] = await db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.id, id))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) {
    throw notFound("Папка не найдена");
  }
  // Не отдаём чужую папку даже при угадывании id.
  await assertCanReadSpace(db, ctx, {
    ownerScope: row.ownerScope === "school" ? "school" : "teacher",
    teacherId: row.teacherId,
  });
  return row;
}

/** Корневые teacher-папки зеркалим в topic_sections (совместимость section_id). */
async function mirrorRootSection(
  db: AppDb,
  folder: {
    id: string;
    organizationId: string;
    ownerScope: string;
    teacherId: string | null;
    parentId: string | null;
    title: string;
    sortOrder: number;
  }
) {
  if (folder.ownerScope !== "teacher" || !folder.teacherId || folder.parentId) {
    if (folder.parentId) {
      await db.delete(topicSections).where(eq(topicSections.id, folder.id));
    }
    return;
  }
  const [existing] = await db
    .select()
    .from(topicSections)
    .where(eq(topicSections.id, folder.id))
    .limit(1);
  const values = {
    id: folder.id,
    organizationId: folder.organizationId,
    teacherId: folder.teacherId,
    title: folder.title,
    sortOrder: folder.sortOrder,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(topicSections).set(values).where(eq(topicSections.id, folder.id));
  } else {
    await db.insert(topicSections).values({ ...values, createdAt: new Date() });
  }
}

/**
 * section_id пишем только если папка зеркалится в topic_sections (корень teacher).
 * Иначе FK на topic_sections сломается для вложенных папок.
 */
export async function legacySectionIdForFolder(
  db: AppDb,
  folderId: string | null
): Promise<string | null> {
  if (!folderId) return null;
  const [sec] = await db
    .select({ id: topicSections.id })
    .from(topicSections)
    .where(eq(topicSections.id, folderId))
    .limit(1);
  return sec?.id ?? null;
}

export async function listMaterialFolders(
  db: AppDb,
  ctx: AuthContext,
  space: FolderSpace
): Promise<MaterialFolder[]> {
  await assertCanReadSpace(db, ctx, space);
  const rows = await db
    .select()
    .from(materialFolders)
    .where(spaceWhere(space, ctx.organizationId));
  return rows.map(mapFolder).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getFolderBreadcrumbs(
  db: AppDb,
  ctx: AuthContext,
  folderId: string | null,
  space: FolderSpace
) {
  const folders = await listMaterialFolders(db, ctx, space);
  if (folderId) {
    const hit = folders.find((f) => f.id === folderId);
    if (!hit) throw notFound("Папка не найдена");
  }
  return buildFolderBreadcrumbs(folders, folderId);
}

export async function upsertMaterialFolder(
  db: AppDb,
  ctx: AuthContext,
  input: {
    id?: string;
    title: string;
    parentId?: string | null;
    ownerScope: FolderSpace["ownerScope"];
    teacherId?: string | null;
    sortOrder?: number;
  }
) {
  const title = input.title.trim();
  if (!title) throw validationError("Укажите название папки");
  const space: FolderSpace = {
    ownerScope: input.ownerScope,
    teacherId: input.ownerScope === "school" ? null : input.teacherId ?? null,
  };
  await assertCanManageSpace(db, ctx, space);

  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = await getFolderOrThrow(db, ctx, parentId);
    if (parent.ownerScope !== space.ownerScope) {
      throw badRequest("Родительская папка в другом пространстве");
    }
    if (space.ownerScope === "teacher" && parent.teacherId !== space.teacherId) {
      throw forbidden();
    }
  }

  const id = input.id ?? newId("fld");
  const siblings = await db
    .select()
    .from(materialFolders)
    .where(
      and(
        spaceWhere(space, ctx.organizationId),
        parentId == null
          ? isNull(materialFolders.parentId)
          : eq(materialFolders.parentId, parentId)
      )
    );
  const sortOrder =
    input.sortOrder ??
    (siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0);

  const [existing] = await db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.id, id))
    .limit(1);

  if (existing) {
    if (existing.organizationId !== ctx.organizationId) throw notFound();
    await assertCanManageSpace(db, ctx, {
      ownerScope: existing.ownerScope === "school" ? "school" : "teacher",
      teacherId: existing.teacherId,
    });
    await db
      .update(materialFolders)
      .set({
        title,
        parentId,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(materialFolders.id, id));
  } else {
    await db.insert(materialFolders).values({
      id,
      organizationId: ctx.organizationId,
      ownerScope: space.ownerScope,
      teacherId: space.teacherId,
      parentId,
      title,
      sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const [row] = await db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.id, id))
    .limit(1);
  if (!row) throw notFound();
  await mirrorRootSection(db, row);
  return mapFolder(row);
}

export async function moveMaterialFolder(
  db: AppDb,
  ctx: AuthContext,
  folderId: string,
  targetParentId: string | null
) {
  const folder = await getFolderOrThrow(db, ctx, folderId);
  const space: FolderSpace = {
    ownerScope: folder.ownerScope === "school" ? "school" : "teacher",
    teacherId: folder.teacherId,
  };
  await assertCanManageSpace(db, ctx, space);

  const all = (await loadOrgFolders(db, ctx.organizationId)).map(mapFolder);
  if (wouldCreateFolderCycle(all, folderId, targetParentId)) {
    throw badRequest("Нельзя переместить папку внутрь самой себя или потомка");
  }
  if (targetParentId) {
    const parent = await getFolderOrThrow(db, ctx, targetParentId);
    if (
      parent.ownerScope !== folder.ownerScope ||
      parent.teacherId !== folder.teacherId
    ) {
      throw forbidden("Нельзя переместить папку в чужое пространство");
    }
  }

  await db
    .update(materialFolders)
    .set({ parentId: targetParentId, updatedAt: new Date() })
    .where(eq(materialFolders.id, folderId));

  const [row] = await db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.id, folderId))
    .limit(1);
  if (!row) throw notFound();
  await mirrorRootSection(db, row);
  // Материалы в бывшей корневой папке: section_id нужно обновить
  const legacy = await legacySectionIdForFolder(db, folderId);
  await db
    .update(topics)
    .set({ sectionId: legacy, updatedAt: new Date() })
    .where(eq(topics.folderId, folderId));
  await db
    .update(tests)
    .set({ sectionId: legacy, updatedAt: new Date() })
    .where(eq(tests.folderId, folderId));
  return mapFolder(row);
}

export async function reorderMaterialFolders(
  db: AppDb,
  ctx: AuthContext,
  space: FolderSpace,
  parentId: string | null,
  orderedIds: string[]
) {
  await assertCanManageSpace(db, ctx, space);
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const folder = await getFolderOrThrow(db, ctx, id);
    if (
      folder.ownerScope !== space.ownerScope ||
      folder.teacherId !== space.teacherId ||
      folder.parentId !== parentId
    ) {
      throw badRequest("Папка не принадлежит этому уровню");
    }
    await db
      .update(materialFolders)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(eq(materialFolders.id, id));
    await mirrorRootSection(db, { ...folder, sortOrder: i });
  }
  return { ok: true as const };
}

export type DeleteFolderMode = "empty_only" | "move_to_parent";

/**
 * Удаление папки без каскада материалов.
 * empty_only — только пустая; move_to_parent — содержимое в родителя.
 */
export async function deleteMaterialFolder(
  db: AppDb,
  ctx: AuthContext,
  folderId: string,
  mode: DeleteFolderMode = "move_to_parent"
) {
  const folder = await getFolderOrThrow(db, ctx, folderId);
  const space: FolderSpace = {
    ownerScope: folder.ownerScope === "school" ? "school" : "teacher",
    teacherId: folder.teacherId,
  };
  await assertCanManageSpace(db, ctx, space);

  const childFolders = await db
    .select({ id: materialFolders.id })
    .from(materialFolders)
    .where(eq(materialFolders.parentId, folderId));

  const [topicCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(topics)
    .where(eq(topics.folderId, folderId));
  const [testCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tests)
    .where(eq(tests.folderId, folderId));
  const [theoryCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(theoryMaterials)
    .where(eq(theoryMaterials.folderId, folderId));
  const [intensiveCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(intensives)
    .where(eq(intensives.folderId, folderId));

  const hasChildren =
    childFolders.length > 0 ||
    (topicCount?.n ?? 0) > 0 ||
    (testCount?.n ?? 0) > 0 ||
    (theoryCount?.n ?? 0) > 0 ||
    (intensiveCount?.n ?? 0) > 0;

  if (hasChildren && mode === "empty_only") {
    throw badRequest("Папка не пуста. Переместите содержимое или выберите удаление с переносом в родителя.");
  }

  const targetParent = folder.parentId;
  const legacyTarget = await legacySectionIdForFolder(db, targetParent);

  if (hasChildren) {
    if (childFolders.length) {
      const ids = childFolders.map((c) => c.id);
      await db
        .update(materialFolders)
        .set({ parentId: targetParent, updatedAt: new Date() })
        .where(inArray(materialFolders.id, ids));
      for (const id of ids) {
        const [child] = await db
          .select()
          .from(materialFolders)
          .where(eq(materialFolders.id, id))
          .limit(1);
        if (child) await mirrorRootSection(db, child);
      }
    }
    await db
      .update(topics)
      .set({
        folderId: targetParent,
        sectionId: legacyTarget,
        updatedAt: new Date(),
      })
      .where(eq(topics.folderId, folderId));
    await db
      .update(tests)
      .set({
        folderId: targetParent,
        sectionId: legacyTarget,
        updatedAt: new Date(),
      })
      .where(eq(tests.folderId, folderId));
    await db
      .update(theoryMaterials)
      .set({ folderId: targetParent, updatedAt: new Date() })
      .where(eq(theoryMaterials.folderId, folderId));
    await db
      .update(intensives)
      .set({ folderId: targetParent, updatedAt: new Date() })
      .where(eq(intensives.folderId, folderId));
  }

  await db.delete(topicSections).where(eq(topicSections.id, folderId));
  await db.delete(materialFolders).where(eq(materialFolders.id, folderId));
  return { ok: true as const };
}

export type FolderMaterialRef = {
  kind: Exclude<MaterialFolderKind, "folder">;
  id: string;
};

export async function moveMaterialToFolder(
  db: AppDb,
  ctx: AuthContext,
  material: FolderMaterialRef,
  folderId: string | null
) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);

  let space: FolderSpace | null = null;
  if (folderId) {
    const folder = await getFolderOrThrow(db, ctx, folderId);
    space = {
      ownerScope: folder.ownerScope === "school" ? "school" : "teacher",
      teacherId: folder.teacherId,
    };
    await assertCanManageSpace(db, ctx, space);
  }

  const legacy = await legacySectionIdForFolder(db, folderId);

  if (material.kind === "topic") {
    const [row] = await db.select().from(topics).where(eq(topics.id, material.id)).limit(1);
    if (!row || row.organizationId !== ctx.organizationId) throw notFound();
    await assertMaterialOwner(db, ctx, row.libraryScope, row.teacherId);
    if (space && !scopesCompatible(row.libraryScope, row.teacherId, space)) {
      throw forbidden("Нельзя переместить материал в это пространство");
    }
    await db
      .update(topics)
      .set({ folderId, sectionId: legacy, updatedAt: new Date() })
      .where(eq(topics.id, material.id));
  } else if (material.kind === "test") {
    const [row] = await db.select().from(tests).where(eq(tests.id, material.id)).limit(1);
    if (!row || row.organizationId !== ctx.organizationId) throw notFound();
    await assertMaterialOwner(db, ctx, row.libraryScope, row.teacherId);
    if (space && !scopesCompatible(row.libraryScope, row.teacherId, space)) {
      throw forbidden("Нельзя переместить материал в это пространство");
    }
    await db
      .update(tests)
      .set({ folderId, sectionId: legacy, updatedAt: new Date() })
      .where(eq(tests.id, material.id));
  } else if (material.kind === "theory") {
    const [row] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, material.id))
      .limit(1);
    if (!row || row.organizationId !== ctx.organizationId) throw notFound();
    await assertMaterialOwner(db, ctx, row.libraryScope, row.teacherId);
    if (space && !scopesCompatible(row.libraryScope, row.teacherId, space)) {
      throw forbidden("Нельзя переместить материал в это пространство");
    }
    await db
      .update(theoryMaterials)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(theoryMaterials.id, material.id));
  } else {
    const [row] = await db
      .select()
      .from(intensives)
      .where(eq(intensives.id, material.id))
      .limit(1);
    if (!row || row.organizationId !== ctx.organizationId) throw notFound();
    await assertMaterialOwner(db, ctx, row.libraryScope, row.teacherId);
    if (space && !scopesCompatible(row.libraryScope, row.teacherId, space)) {
      throw forbidden("Нельзя переместить материал в это пространство");
    }
    await db
      .update(intensives)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(intensives.id, material.id));
  }

  return { ok: true as const };
}

function scopesCompatible(
  libraryScope: string,
  teacherId: string | null,
  space: FolderSpace
): boolean {
  if (space.ownerScope === "school") return libraryScope === "school";
  return libraryScope === "teacher" && teacherId === space.teacherId;
}

async function assertMaterialOwner(
  db: AppDb,
  ctx: AuthContext,
  libraryScope: string,
  teacherId: string | null
) {
  if (libraryScope === "school") {
    if (!canManageSchoolKnowledgeBase(ctx.role)) throw forbidden();
    return;
  }
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (teacherId !== tid) throw forbidden();
    return;
  }
  if (!teacherId) throw forbidden();
  await assertDirectorSeesTeacher(db, ctx, teacherId);
}

async function loadBreadcrumbFolders(
  db: AppDb,
  ctx: AuthContext,
  folderId: string | null
): Promise<MaterialFolder[]> {
  if (!folderId) return [];
  const chain: MaterialFolder[] = [];
  let currentId: string | null = folderId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const [row] = await db
      .select()
      .from(materialFolders)
      .where(eq(materialFolders.id, currentId))
      .limit(1);
    if (!row || row.organizationId !== ctx.organizationId) break;
    chain.push(mapFolder(row));
    currentId = row.parentId;
  }
  return chain.reverse();
}

export async function getFolderContents(
  db: AppDb,
  ctx: AuthContext,
  space: FolderSpace,
  parentId: string | null,
  kinds?: MaterialFolderKind[]
) {
  await assertCanReadSpace(db, ctx, space);
  if (parentId) {
    const parent = await getFolderOrThrow(db, ctx, parentId);
    if (
      parent.ownerScope !== space.ownerScope ||
      parent.teacherId !== space.teacherId
    ) {
      throw forbidden();
    }
  }

  // Только дети текущего уровня — без загрузки всего дерева.
  const childFolderRows = await db
    .select()
    .from(materialFolders)
    .where(
      and(
        spaceWhere(space, ctx.organizationId),
        parentId == null
          ? isNull(materialFolders.parentId)
          : eq(materialFolders.parentId, parentId)
      )
    );
  const childFolders = childFolderRows
    .map(mapFolder)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"));

  const breadcrumbFolders = await loadBreadcrumbFolders(db, ctx, parentId);

  const want = new Set(
    kinds?.length
      ? kinds
      : (["folder", "topic", "test", "theory", "intensive"] as MaterialFolderKind[])
  );

  const items: Array<{
    kind: MaterialFolderKind;
    id: string;
    title: string;
    sortOrder: number;
    meta?: Record<string, unknown>;
  }> = [];

  if (want.has("folder")) {
    for (const f of childFolders) {
      items.push({
        kind: "folder",
        id: f.id,
        title: f.title,
        sortOrder: f.sortOrder,
      });
    }
  }

  const folderCond =
    parentId == null ? isNull(topics.folderId) : eq(topics.folderId, parentId);
  const scopeCond =
    space.ownerScope === "school"
      ? and(eq(topics.organizationId, ctx.organizationId), eq(topics.libraryScope, "school"))
      : and(
          eq(topics.organizationId, ctx.organizationId),
          eq(topics.libraryScope, "teacher"),
          eq(topics.teacherId, space.teacherId!)
        );

  if (want.has("topic")) {
    const rows = await db
      .select()
      .from(topics)
      .where(and(scopeCond, folderCond));
    for (const r of rows) {
      items.push({
        kind: "topic",
        id: r.id,
        title: r.title,
        sortOrder: r.sortOrder,
        meta: { status: r.status, subject: r.subject },
      });
    }
  }

  if (want.has("test")) {
    const testFolderCond =
      parentId == null ? isNull(tests.folderId) : eq(tests.folderId, parentId);
    const testScope =
      space.ownerScope === "school"
        ? and(eq(tests.organizationId, ctx.organizationId), eq(tests.libraryScope, "school"))
        : and(
            eq(tests.organizationId, ctx.organizationId),
            eq(tests.libraryScope, "teacher"),
            eq(tests.teacherId, space.teacherId!)
          );
    const rows = await db
      .select()
      .from(tests)
      .where(and(testScope, testFolderCond, eq(tests.purpose, "homework")));
    for (const r of rows) {
      items.push({
        kind: "test",
        id: r.id,
        title: r.title,
        sortOrder: r.sortOrder,
        meta: { status: r.status, purpose: r.purpose },
      });
    }
  }

  if (want.has("theory")) {
    const theoryFolderCond =
      parentId == null
        ? isNull(theoryMaterials.folderId)
        : eq(theoryMaterials.folderId, parentId);
    const theoryScope =
      space.ownerScope === "school"
        ? and(
            eq(theoryMaterials.organizationId, ctx.organizationId),
            eq(theoryMaterials.libraryScope, "school")
          )
        : and(
            eq(theoryMaterials.organizationId, ctx.organizationId),
            eq(theoryMaterials.libraryScope, "teacher"),
            eq(theoryMaterials.teacherId, space.teacherId!)
          );
    const rows = await db
      .select()
      .from(theoryMaterials)
      .where(and(theoryScope, theoryFolderCond));
    for (const r of rows) {
      items.push({
        kind: "theory",
        id: r.id,
        title: r.title,
        sortOrder: 0,
        meta: { status: r.status },
      });
    }
  }

  if (want.has("intensive")) {
    const intensiveFolderCond =
      parentId == null ? isNull(intensives.folderId) : eq(intensives.folderId, parentId);
    const intensiveScope =
      space.ownerScope === "school"
        ? and(
            eq(intensives.organizationId, ctx.organizationId),
            eq(intensives.libraryScope, "school")
          )
        : and(
            eq(intensives.organizationId, ctx.organizationId),
            eq(intensives.libraryScope, "teacher"),
            eq(intensives.teacherId, space.teacherId!)
          );
    const rows = await db
      .select()
      .from(intensives)
      .where(and(intensiveScope, intensiveFolderCond));
    for (const r of rows) {
      items.push({
        kind: "intensive",
        id: r.id,
        title: r.title,
        sortOrder: 0,
        meta: { status: r.status },
      });
    }
  }

  items.sort((a, b) => {
    if (a.kind === "folder" && b.kind !== "folder") return -1;
    if (b.kind === "folder" && a.kind !== "folder") return 1;
    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru");
  });

  return {
    parentId,
    breadcrumbs: buildFolderBreadcrumbs(
      [...breadcrumbFolders, ...childFolders],
      parentId
    ),
    items,
  };
}

export async function searchFolderSpace(
  db: AppDb,
  ctx: AuthContext,
  space: FolderSpace,
  query: string,
  scope: "current" | "all",
  currentFolderId: string | null
) {
  const q = query.trim();
  if (!q) {
    return { items: [] as Awaited<ReturnType<typeof getFolderContents>>["items"] };
  }

  await assertCanReadSpace(db, ctx, space);
  const pattern = `%${q.replace(/[%_]/g, "")}%`;

  let allowedFolderIds: Set<string | null> | null = null;
  if (scope === "current") {
    if (currentFolderId) {
      const folders = await listMaterialFolders(db, ctx, space);
      allowedFolderIds = new Set([
        currentFolderId,
        ...collectFolderDescendantIds(folders, currentFolderId),
      ]);
    } else {
      allowedFolderIds = new Set([null]);
    }
  }

  const items: Awaited<ReturnType<typeof getFolderContents>>["items"] = [];

  const folderRows = await db
    .select()
    .from(materialFolders)
    .where(
      and(
        spaceWhere(space, ctx.organizationId),
        sql`${materialFolders.title} ilike ${pattern}`
      )
    );
  for (const row of folderRows) {
    if (
      allowedFolderIds &&
      !(
        allowedFolderIds.has(row.parentId) ||
        (row.parentId == null && allowedFolderIds.has(null))
      )
    ) {
      continue;
    }
    if (scope === "current" && currentFolderId == null && row.parentId != null) {
      continue;
    }
    items.push({
      kind: "folder",
      id: row.id,
      title: row.title,
      sortOrder: row.sortOrder,
    });
  }

  const topicScope =
    space.ownerScope === "school"
      ? and(
          eq(topics.organizationId, ctx.organizationId),
          eq(topics.libraryScope, "school")
        )
      : and(
          eq(topics.organizationId, ctx.organizationId),
          eq(topics.libraryScope, "teacher"),
          eq(topics.teacherId, space.teacherId!)
        );
  const topicRows = await db
    .select()
    .from(topics)
    .where(and(topicScope, sql`${topics.title} ilike ${pattern}`));
  for (const row of topicRows) {
    if (allowedFolderIds && !allowedFolderIds.has(row.folderId)) continue;
    items.push({
      kind: "topic",
      id: row.id,
      title: row.title,
      sortOrder: row.sortOrder,
      meta: { status: row.status },
    });
  }

  const testScope =
    space.ownerScope === "school"
      ? and(
          eq(tests.organizationId, ctx.organizationId),
          eq(tests.libraryScope, "school")
        )
      : and(
          eq(tests.organizationId, ctx.organizationId),
          eq(tests.libraryScope, "teacher"),
          eq(tests.teacherId, space.teacherId!)
        );
  const testRows = await db
    .select()
    .from(tests)
    .where(
      and(
        testScope,
        eq(tests.purpose, "homework"),
        sql`${tests.title} ilike ${pattern}`
      )
    );
  for (const row of testRows) {
    if (allowedFolderIds && !allowedFolderIds.has(row.folderId)) continue;
    items.push({
      kind: "test",
      id: row.id,
      title: row.title,
      sortOrder: row.sortOrder,
      meta: { status: row.status },
    });
  }

  const theoryScope =
    space.ownerScope === "school"
      ? and(
          eq(theoryMaterials.organizationId, ctx.organizationId),
          eq(theoryMaterials.libraryScope, "school")
        )
      : and(
          eq(theoryMaterials.organizationId, ctx.organizationId),
          eq(theoryMaterials.libraryScope, "teacher"),
          eq(theoryMaterials.teacherId, space.teacherId!)
        );
  const theoryRows = await db
    .select()
    .from(theoryMaterials)
    .where(and(theoryScope, sql`${theoryMaterials.title} ilike ${pattern}`));
  for (const row of theoryRows) {
    if (allowedFolderIds && !allowedFolderIds.has(row.folderId)) continue;
    items.push({
      kind: "theory",
      id: row.id,
      title: row.title,
      sortOrder: 0,
      meta: { status: row.status },
    });
  }

  const intensiveScope =
    space.ownerScope === "school"
      ? and(
          eq(intensives.organizationId, ctx.organizationId),
          eq(intensives.libraryScope, "school")
        )
      : and(
          eq(intensives.organizationId, ctx.organizationId),
          eq(intensives.libraryScope, "teacher"),
          eq(intensives.teacherId, space.teacherId!)
        );
  const intensiveRows = await db
    .select()
    .from(intensives)
    .where(and(intensiveScope, sql`${intensives.title} ilike ${pattern}`));
  for (const row of intensiveRows) {
    if (allowedFolderIds && !allowedFolderIds.has(row.folderId)) continue;
    items.push({
      kind: "intensive",
      id: row.id,
      title: row.title,
      sortOrder: 0,
      meta: { status: row.status },
    });
  }

  items.sort((a, b) => {
    const af = a.kind === "folder" ? 0 : 1;
    const bf = b.kind === "folder" ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru");
  });

  return { items };
}
