import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  collectFolderDescendantIds,
  wouldCreateFolderCycle,
  type FolderSpace,
} from "@/lib/folders/material-folders";
import { isSystemFolderKey } from "@/lib/folders/system-kb-structure";
import type { TheoryAllowedMime } from "@/lib/theory/constants";
import type { AuthContext } from "@/server/authz/context";
import {
  intensiveFiles,
  intensiveTests,
  intensiveVersionTests,
  intensiveVersions,
  intensives,
  materialFolders,
  testAnswerKeys,
  tests,
  theoryFiles,
  theoryMaterialVersions,
  theoryMaterials,
  topics,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, notFound } from "@/server/errors";
import {
  legacySectionIdForFolder,
  listMaterialFolders,
} from "@/server/services/folder-service";
import {
  deleteTheoryObject,
  getTheoryObject,
  intensiveObjectKey,
  putTheoryObject,
  theoryObjectKey,
} from "@/server/media/theory-storage";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asTheoryMime(mime: string): TheoryAllowedMime {
  if (
    mime === "application/pdf" ||
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/webp"
  ) {
    return mime as TheoryAllowedMime;
  }
  return "application/pdf";
}

async function loadFolderRow(
  db: AppDb,
  ctx: AuthContext,
  folderId: string
) {
  const [row] = await db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.id, folderId))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) {
    throw notFound("Папка не найдена");
  }
  return row;
}

/**
 * Глубокое копирование папки со всей вложенностью и материалами
 * в другое место того же пространства (school / teacher).
 */
export async function pasteMaterialFolderTree(
  db: AppDb,
  ctx: AuthContext,
  input: {
    sourceFolderId: string;
    targetParentId: string | null;
  }
) {
  const source = await loadFolderRow(db, ctx, input.sourceFolderId);
  if (isSystemFolderKey(source.systemKey)) {
    throw badRequest("Системную папку нельзя копировать");
  }

  const space: FolderSpace = {
    ownerScope: source.ownerScope === "school" ? "school" : "teacher",
    teacherId: source.teacherId,
  };
  const spaceFolders = await listMaterialFolders(db, ctx, space);
  const sourceInSpace = spaceFolders.find((f) => f.id === source.id);
  if (!sourceInSpace) throw notFound("Папка не найдена в этом пространстве");

  if (input.targetParentId) {
    const target = spaceFolders.find((f) => f.id === input.targetParentId);
    if (!target) throw notFound("Целевая папка не найдена");
  }

  if (wouldCreateFolderCycle(spaceFolders, source.id, input.targetParentId)) {
    throw badRequest(
      "Нельзя вставить папку внутрь самой себя или её вложенных папок"
    );
  }

  const descendantIds = collectFolderDescendantIds(spaceFolders, source.id);
  const treeIds = [source.id, ...descendantIds];
  const treeFolders = spaceFolders
    .filter((f) => treeIds.includes(f.id))
    .sort((a, b) => {
      // родители раньше детей
      const depth = (id: string) => {
        let d = 0;
        let cur = spaceFolders.find((f) => f.id === id);
        const seen = new Set<string>();
        while (cur?.parentId) {
          if (seen.has(cur.id)) break;
          seen.add(cur.id);
          d += 1;
          cur = spaceFolders.find((f) => f.id === cur!.parentId);
        }
        return d;
      };
      return depth(a.id) - depth(b.id);
    });

  const writtenKeys: string[] = [];
  try {
    return await db.transaction(async (tx) => {
      const tdb = tx as AppDb;
      const idMap = new Map<string, string>();

      for (const folder of treeFolders) {
        const newFolderId = newId("fld");
        idMap.set(folder.id, newFolderId);
        const mappedParent =
          folder.id === source.id
            ? input.targetParentId
            : folder.parentId
              ? (idMap.get(folder.parentId) ?? null)
              : null;
        await tdb.insert(materialFolders).values({
          id: newFolderId,
          organizationId: ctx.organizationId,
          ownerScope: space.ownerScope,
          teacherId: space.teacherId,
          parentId: mappedParent,
          title: folder.title,
          contentKind: folder.contentKind ?? null,
          systemKey: null,
          sortOrder: folder.sortOrder,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const owner = {
        organizationId: ctx.organizationId,
        teacherId: space.teacherId,
        libraryScope: space.ownerScope as "school" | "teacher",
      };

      for (const oldFolderId of treeIds) {
        const newFolderId = idMap.get(oldFolderId)!;
        const legacySection = await legacySectionIdForFolder(tdb, newFolderId);

        const topicRows = await tdb
          .select()
          .from(topics)
          .where(eq(topics.folderId, oldFolderId));
        for (const row of topicRows) {
          await tdb.insert(topics).values({
            id: newId("tp"),
            organizationId: owner.organizationId,
            teacherId: owner.teacherId,
            libraryScope: owner.libraryScope,
            sectionId: legacySection,
            folderId: newFolderId,
            title: row.title,
            subject: row.subject,
            description: row.description,
            programNote: row.programNote,
            status: row.status,
            sortOrder: row.sortOrder,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        const testRows = await tdb
          .select()
          .from(tests)
          .where(
            and(eq(tests.folderId, oldFolderId), eq(tests.purpose, "homework"))
          );
        for (const row of testRows) {
          await copyTestIntoFolder(tdb, row, owner, newFolderId, legacySection);
        }

        const theoryRows = await tdb
          .select()
          .from(theoryMaterials)
          .where(eq(theoryMaterials.folderId, oldFolderId));
        for (const row of theoryRows) {
          await copyTheoryIntoFolder(
            tdb,
            row,
            owner,
            newFolderId,
            writtenKeys
          );
        }

        const intensiveRows = await tdb
          .select()
          .from(intensives)
          .where(eq(intensives.folderId, oldFolderId));
        for (const row of intensiveRows) {
          await copyIntensiveIntoFolder(
            tdb,
            row,
            owner,
            newFolderId,
            writtenKeys
          );
        }
      }

      const rootCopyId = idMap.get(source.id)!;
      return {
        ok: true as const,
        folderId: rootCopyId,
        copiedFolders: idMap.size,
      };
    });
  } catch (err) {
    await Promise.all(
      writtenKeys.map((key) => deleteTheoryObject(key).catch(() => undefined))
    );
    throw err;
  }
}

async function copyTestIntoFolder(
  db: AppDb,
  source: typeof tests.$inferSelect,
  owner: {
    organizationId: string;
    teacherId: string | null;
    libraryScope: "school" | "teacher";
  },
  folderId: string,
  sectionId: string | null
) {
  const id = newId("hw");
  const { copyTestQuestionImages } = await import(
    "@/server/services/test-question-image-service"
  );
  const questionsPublic = await copyTestQuestionImages(
    db,
    owner.organizationId,
    source.id,
    id,
    cloneJson(source.questionsPublic ?? []) as never
  );
  await db.insert(tests).values({
    id,
    organizationId: owner.organizationId,
    topicId: null,
    sectionId,
    folderId,
    teacherId: owner.teacherId,
    libraryScope: owner.libraryScope,
    title: source.title,
    description: source.description,
    status: source.status,
    purpose: source.purpose,
    maxScore: source.maxScore,
    questionsPublic,
    sortOrder: source.sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const keys = await db
    .select()
    .from(testAnswerKeys)
    .where(eq(testAnswerKeys.testId, source.id));
  for (const key of keys) {
    await db.insert(testAnswerKeys).values({
      id: newId("key"),
      testId: id,
      questionId: key.questionId,
      payload: cloneJson(key.payload),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return id;
}

async function copyTheoryIntoFolder(
  db: AppDb,
  source: typeof theoryMaterials.$inferSelect,
  owner: {
    organizationId: string;
    teacherId: string | null;
    libraryScope: "school" | "teacher";
  },
  folderId: string,
  writtenKeys: string[]
) {
  let testId: string | null = null;
  if (source.testId) {
    const [srcTest] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, source.testId))
      .limit(1);
    if (srcTest) {
      testId = await copyTestIntoFolder(db, srcTest, owner, folderId, null);
    }
  }
  const id = newId("thm");
  await db.insert(theoryMaterials).values({
    id,
    organizationId: owner.organizationId,
    teacherId: owner.teacherId,
    libraryScope: owner.libraryScope,
    folderId,
    title: source.title,
    description: source.description,
    videoUrl: source.videoUrl,
    videoProvider: source.videoProvider,
    videoEmbedUrl: source.videoEmbedUrl,
    embedAllowed: source.embedAllowed,
    videoWarning: source.videoWarning,
    status: source.status,
    testId,
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const draftFiles = await db
    .select()
    .from(theoryFiles)
    .where(and(eq(theoryFiles.materialId, source.id), isNull(theoryFiles.versionId)));
  const copiedFiles: {
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }[] = [];
  for (const file of draftFiles) {
    try {
      const bytes = await getTheoryObject(file.objectKey);
      const mime = asTheoryMime(file.mimeType);
      const objectKey = theoryObjectKey(owner.organizationId, id, mime);
      await putTheoryObject(objectKey, bytes, mime);
      writtenKeys.push(objectKey);
      await db.insert(theoryFiles).values({
        id: newId("thf"),
        organizationId: owner.organizationId,
        materialId: id,
        versionId: null,
        objectKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
      copiedFiles.push({
        objectKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
    } catch {
      // Файл недоступен — копируем запись без байтов не делаем; пропускаем файл.
    }
  }

  if (source.currentVersionId) {
    const [ver] = await db
      .select()
      .from(theoryMaterialVersions)
      .where(eq(theoryMaterialVersions.id, source.currentVersionId))
      .limit(1);
    if (ver) {
      const versionId = newId("thv");
      await db.insert(theoryMaterialVersions).values({
        id: versionId,
        materialId: id,
        title: ver.title,
        description: ver.description,
        videoUrl: ver.videoUrl,
        videoProvider: ver.videoProvider,
        videoEmbedUrl: ver.videoEmbedUrl,
        embedAllowed: ver.embedAllowed,
        videoWarning: ver.videoWarning,
        testId,
        publishedAt: ver.publishedAt ?? new Date(),
      });
      if (copiedFiles.length) {
        await db.insert(theoryFiles).values(
          copiedFiles.map((file) => ({
            id: newId("thf"),
            organizationId: owner.organizationId,
            materialId: id,
            versionId,
            objectKey: file.objectKey,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          }))
        );
      }
      await db
        .update(theoryMaterials)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(theoryMaterials.id, id));
    }
  }
  return id;
}

async function copyIntensiveIntoFolder(
  db: AppDb,
  source: typeof intensives.$inferSelect,
  owner: {
    organizationId: string;
    teacherId: string | null;
    libraryScope: "school" | "teacher";
  },
  folderId: string,
  writtenKeys: string[]
) {
  const id = newId("int");
  await db.insert(intensives).values({
    id,
    organizationId: owner.organizationId,
    teacherId: owner.teacherId,
    libraryScope: owner.libraryScope,
    folderId,
    title: source.title,
    description: source.description,
    videoUrl: source.videoUrl,
    videoProvider: source.videoProvider,
    videoEmbedUrl: source.videoEmbedUrl,
    embedAllowed: source.embedAllowed,
    videoWarning: source.videoWarning,
    status: source.status,
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const linked = await db
    .select()
    .from(intensiveTests)
    .where(eq(intensiveTests.intensiveId, source.id));
  const testIdMap = new Map<string, string>();
  for (const link of linked) {
    const [srcTest] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, link.testId))
      .limit(1);
    if (!srcTest) continue;
    const newTestId = await copyTestIntoFolder(
      db,
      srcTest,
      owner,
      folderId,
      null
    );
    testIdMap.set(link.testId, newTestId);
    await db.insert(intensiveTests).values({
      intensiveId: id,
      testId: newTestId,
      sortOrder: link.sortOrder,
    });
  }

  const versions = await db
    .select()
    .from(intensiveVersions)
    .where(eq(intensiveVersions.intensiveId, source.id));
  let currentVersionId: string | null = null;
  for (const ver of versions) {
    const versionId = newId("inv");
    await db.insert(intensiveVersions).values({
      id: versionId,
      intensiveId: id,
      title: ver.title,
      description: ver.description,
      videoUrl: ver.videoUrl,
      videoProvider: ver.videoProvider,
      videoEmbedUrl: ver.videoEmbedUrl,
      embedAllowed: ver.embedAllowed,
      videoWarning: ver.videoWarning,
      publishedAt: ver.publishedAt,
    });
    if (source.currentVersionId === ver.id) currentVersionId = versionId;

    const vTests = await db
      .select()
      .from(intensiveVersionTests)
      .where(eq(intensiveVersionTests.versionId, ver.id));
    for (const vt of vTests) {
      const mapped = testIdMap.get(vt.testId);
      if (!mapped) continue;
      await db.insert(intensiveVersionTests).values({
        versionId,
        testId: mapped,
        sortOrder: vt.sortOrder,
      });
    }

    const vFiles = await db
      .select()
      .from(intensiveFiles)
      .where(eq(intensiveFiles.versionId, ver.id));
    for (const file of vFiles) {
      try {
        const bytes = await getTheoryObject(file.objectKey);
        const objectKey = intensiveObjectKey(owner.organizationId, id);
        await putTheoryObject(objectKey, bytes, file.mimeType);
        writtenKeys.push(objectKey);
        await db.insert(intensiveFiles).values({
          id: newId("inf"),
          organizationId: owner.organizationId,
          intensiveId: id,
          versionId,
          objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        });
      } catch {
        // skip missing blobs
      }
    }
  }

  const draftFiles = await db
    .select()
    .from(intensiveFiles)
    .where(
      and(eq(intensiveFiles.intensiveId, source.id), isNull(intensiveFiles.versionId))
    );
  for (const file of draftFiles) {
    try {
      const bytes = await getTheoryObject(file.objectKey);
      const objectKey = intensiveObjectKey(owner.organizationId, id);
      await putTheoryObject(objectKey, bytes, file.mimeType);
      writtenKeys.push(objectKey);
      await db.insert(intensiveFiles).values({
        id: newId("inf"),
        organizationId: owner.organizationId,
        intensiveId: id,
        versionId: null,
        objectKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
    } catch {
      // skip
    }
  }

  if (currentVersionId) {
    await db
      .update(intensives)
      .set({ currentVersionId, updatedAt: new Date() })
      .where(eq(intensives.id, id));
  }
  return id;
}

/** Проверка доступности копирования (для UI). */
export async function canCopyMaterialFolder(
  db: AppDb,
  ctx: AuthContext,
  folderId: string
) {
  const row = await loadFolderRow(db, ctx, folderId);
  return {
    ok: true as const,
    canCopy: !isSystemFolderKey(row.systemKey),
    title: row.title,
  };
}
