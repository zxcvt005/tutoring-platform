import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { hasTheoryComponent } from "@/lib/theory/components";
import {
  THEORY_ALLOWED_MIME_TYPES,
  type TheoryAllowedMime,
} from "@/lib/theory/constants";
import type { TheoryVideoProvider } from "@/lib/theory/video";
import type { LibraryScope, MaterialOrigin, TestQuestion } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireSchoolKnowledgeBase } from "@/server/authz/school-knowledge";
import {
  materialOrigins,
  organizations,
  teachers,
  testAnswerKeys,
  tests,
  theoryFiles,
  theoryMaterialVersions,
  theoryMaterials,
  topics,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { ApiError, badRequest, notFound } from "@/server/errors";
import {
  deleteTheoryObject,
  getTheoryObject,
  putTheoryObject,
  theoryObjectKey,
} from "@/server/media/theory-storage";
import { loadOriginMap, originKey } from "@/server/services/material-origins";

export type KnowledgeKind = "theory" | "test" | "topic";

export type TransferItem = {
  kind: KnowledgeKind;
  id: string;
};

export type TransferFailure = {
  kind: KnowledgeKind | string;
  id: string;
  teacherId: string;
  message: string;
};

export type TransferDuplicate = {
  kind: KnowledgeKind;
  id: string;
  title: string;
  teacherId: string;
  teacherName: string;
  existingCopyId: string;
};

export type TransferResult = {
  phase: "plan" | "commit";
  planned: number;
  created: number;
  skipped: number;
  duplicates: TransferDuplicate[];
  failed: TransferFailure[];
};

type SourceRow = {
  kind: KnowledgeKind;
  id: string;
  title: string;
  versionId: string | null;
  authorName?: string;
};

type LibraryOwner = {
  organizationId: string;
  teacherId: string | null;
  libraryScope: LibraryScope;
};

function schoolOwner(organizationId: string): LibraryOwner {
  return { organizationId, teacherId: null, libraryScope: "school" };
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Не удалось скопировать материал";
}

function asTheoryMime(mime: string): TheoryAllowedMime {
  if ((THEORY_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    return mime as TheoryAllowedMime;
  }
  throw badRequest("Файл теории имеет неподдерживаемый тип и не был скопирован");
}

async function schoolAuthorName(db: AppDb, organizationId: string) {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org?.name ? `База знаний · ${org.name}` : "База знаний школы";
}

async function loadSchoolSource(
  db: AppDb,
  organizationId: string,
  item: TransferItem
): Promise<SourceRow> {
  if (item.kind === "theory") {
    const [row] = await db
      .select()
      .from(theoryMaterials)
      .where(
        and(
          eq(theoryMaterials.id, item.id),
          eq(theoryMaterials.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!row || row.libraryScope !== "school") {
      throw badRequest("Теория базы знаний не найдена");
    }
    return {
      kind: "theory",
      id: row.id,
      title: row.title,
      versionId: row.currentVersionId,
    };
  }
  if (item.kind === "test") {
    const [row] = await db
      .select()
      .from(tests)
      .where(and(eq(tests.id, item.id), eq(tests.organizationId, organizationId)))
      .limit(1);
    if (!row || row.libraryScope !== "school") {
      throw badRequest("Тест базы знаний не найден");
    }
    return { kind: "test", id: row.id, title: row.title, versionId: null };
  }
  const [row] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, item.id), eq(topics.organizationId, organizationId)))
    .limit(1);
  if (!row || row.libraryScope !== "school") {
    throw badRequest("Тема базы знаний не найдена");
  }
  return { kind: "topic", id: row.id, title: row.title, versionId: null };
}

async function findExistingCopy(
  db: AppDb,
  organizationId: string,
  kind: KnowledgeKind,
  sourceId: string,
  teacherId: string
) {
  const origins = await db
    .select({ materialId: materialOrigins.materialId })
    .from(materialOrigins)
    .where(
      and(
        eq(materialOrigins.organizationId, organizationId),
        eq(materialOrigins.materialKind, kind),
        eq(materialOrigins.sourceKind, kind),
        eq(materialOrigins.sourceId, sourceId)
      )
    );
  const ids = origins.map((row) => row.materialId);
  if (!ids.length) return null;
  if (kind === "theory") {
    const [row] = await db
      .select({ id: theoryMaterials.id })
      .from(theoryMaterials)
      .where(
        and(
          inArray(theoryMaterials.id, ids),
          eq(theoryMaterials.organizationId, organizationId),
          eq(theoryMaterials.teacherId, teacherId)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }
  if (kind === "test") {
    const [row] = await db
      .select({ id: tests.id })
      .from(tests)
      .where(
        and(
          inArray(tests.id, ids),
          eq(tests.organizationId, organizationId),
          eq(tests.teacherId, teacherId)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        inArray(topics.id, ids),
        eq(topics.organizationId, organizationId),
        eq(topics.teacherId, teacherId)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

async function findExistingSchoolCopy(
  db: AppDb,
  organizationId: string,
  kind: KnowledgeKind,
  sourceId: string
) {
  const origins = await db
    .select({ materialId: materialOrigins.materialId })
    .from(materialOrigins)
    .where(
      and(
        eq(materialOrigins.organizationId, organizationId),
        eq(materialOrigins.materialKind, kind),
        eq(materialOrigins.sourceKind, kind),
        eq(materialOrigins.sourceId, sourceId),
        eq(materialOrigins.sourceScope, "teacher")
      )
    );
  const ids = origins.map((row) => row.materialId);
  if (!ids.length) return null;
  if (kind === "theory") {
    const [row] = await db
      .select({ id: theoryMaterials.id })
      .from(theoryMaterials)
      .where(
        and(
          inArray(theoryMaterials.id, ids),
          eq(theoryMaterials.organizationId, organizationId),
          eq(theoryMaterials.libraryScope, "school"),
          isNull(theoryMaterials.teacherId)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }
  if (kind === "test") {
    const [row] = await db
      .select({ id: tests.id })
      .from(tests)
      .where(
        and(
          inArray(tests.id, ids),
          eq(tests.organizationId, organizationId),
          eq(tests.libraryScope, "school"),
          isNull(tests.teacherId)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        inArray(topics.id, ids),
        eq(topics.organizationId, organizationId),
        eq(topics.libraryScope, "school"),
        isNull(topics.teacherId)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

async function loadTeacherSource(
  db: AppDb,
  organizationId: string,
  item: TransferItem
): Promise<SourceRow> {
  if (item.kind === "theory") {
    const [row] = await db
      .select()
      .from(theoryMaterials)
      .where(
        and(
          eq(theoryMaterials.id, item.id),
          eq(theoryMaterials.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!row) throw notFound("Теория не найдена");
    if (row.libraryScope !== "teacher" || !row.teacherId) {
      throw badRequest("Сохранять можно только разработку преподавателя");
    }
    return {
      kind: "theory",
      id: row.id,
      title: row.title,
      versionId: row.currentVersionId,
      authorName: await teacherAuthorName(db, row.teacherId),
    };
  }
  if (item.kind === "test") {
    const [row] = await db
      .select()
      .from(tests)
      .where(and(eq(tests.id, item.id), eq(tests.organizationId, organizationId)))
      .limit(1);
    if (!row) throw notFound("Тест не найден");
    if (row.libraryScope !== "teacher" || !row.teacherId) {
      throw badRequest("Сохранять можно только разработку преподавателя");
    }
    if (row.purpose === "theory") {
      throw badRequest("Этот тест относится к теории и сохраняется вместе с ней");
    }
    return {
      kind: "test",
      id: row.id,
      title: row.title,
      versionId: null,
      authorName: await teacherAuthorName(db, row.teacherId),
    };
  }
  const [row] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, item.id), eq(topics.organizationId, organizationId)))
    .limit(1);
  if (!row) throw notFound("Тема не найдена");
  if (row.libraryScope !== "teacher" || !row.teacherId) {
    throw badRequest("Сохранять можно только разработку преподавателя");
  }
  return {
    kind: "topic",
    id: row.id,
    title: row.title,
    versionId: null,
    authorName: await teacherAuthorName(db, row.teacherId),
  };
}

async function teacherAuthorName(db: AppDb, teacherId: string) {
  const [row] = await db
    .select({ fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.id, teacherId))
    .limit(1);
  return row?.fullName || "Преподаватель";
}

async function copyTestRecord(
  db: AppDb,
  sourceId: string,
  owner: { organizationId: string; teacherId: string | null; libraryScope: LibraryScope },
  options?: { purpose?: "homework" | "theory" }
) {
  const [source] = await db
    .select()
    .from(tests)
    .where(eq(tests.id, sourceId))
    .limit(1);
  if (!source) throw badRequest("Тест для копирования не найден");
  const id = newId("hw");
  const { copyTestQuestionImages } = await import(
    "@/server/services/test-question-image-service"
  );
  const questionsPublic = await copyTestQuestionImages(
    db,
    owner.organizationId,
    sourceId,
    id,
    cloneJson(source.questionsPublic ?? []) as TestQuestion[]
  );
  await db.insert(tests).values({
    id,
    organizationId: owner.organizationId,
    topicId: null,
    sectionId: null,
    teacherId: owner.teacherId,
    libraryScope: owner.libraryScope,
    title: source.title,
    description: source.description,
    status: source.status,
    purpose: options?.purpose ?? source.purpose,
    maxScore: source.maxScore,
    questionsPublic,
    sortOrder: source.sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const keys = await db
    .select()
    .from(testAnswerKeys)
    .where(eq(testAnswerKeys.testId, sourceId));
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

async function copyTheoryRecord(
  db: AppDb,
  sourceId: string,
  owner: LibraryOwner,
  writtenKeys: string[]
) {
  const [source] = await db
    .select()
    .from(theoryMaterials)
    .where(eq(theoryMaterials.id, sourceId))
    .limit(1);
  if (!source) throw badRequest("Теория для копирования не найдена");

  let testId: string | null = null;
  if (source.testId) {
    testId = await copyTestRecord(db, source.testId, owner, { purpose: "theory" });
  }

  const id = newId("thm");
  await db.insert(theoryMaterials).values({
    id,
    organizationId: owner.organizationId,
    teacherId: owner.teacherId,
    libraryScope: owner.libraryScope,
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
    .where(and(eq(theoryFiles.materialId, sourceId), isNull(theoryFiles.versionId)));
  const copiedFiles: {
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }[] = [];
  for (const file of draftFiles) {
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
  }

  if (
    source.status === "published" &&
    hasTheoryComponent({
      videoUrl: source.videoUrl,
      testId,
      fileCount: copiedFiles.length,
    })
  ) {
    const versionId = newId("thv");
    await db.insert(theoryMaterialVersions).values({
      id: versionId,
      materialId: id,
      title: source.title,
      description: source.description,
      videoUrl: source.videoUrl,
      videoProvider: source.videoProvider as TheoryVideoProvider | null,
      videoEmbedUrl: source.videoEmbedUrl,
      embedAllowed: source.embedAllowed,
      videoWarning: source.videoWarning,
      testId,
      publishedAt: new Date(),
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

  return id;
}

async function copyTopicRecord(db: AppDb, sourceId: string, owner: LibraryOwner) {
  const [source] = await db
    .select()
    .from(topics)
    .where(eq(topics.id, sourceId))
    .limit(1);
  if (!source) throw badRequest("Тема для копирования не найдена");
  const siblingFilter =
    owner.libraryScope === "school"
      ? and(
          eq(topics.organizationId, owner.organizationId),
          eq(topics.libraryScope, "school"),
          isNull(topics.teacherId),
          isNull(topics.sectionId)
        )
      : and(
          eq(topics.organizationId, owner.organizationId),
          eq(topics.teacherId, owner.teacherId ?? ""),
          isNull(topics.sectionId)
        );
  const siblings = await db
    .select({ sortOrder: topics.sortOrder })
    .from(topics)
    .where(siblingFilter);
  const sortOrder = siblings.length
    ? Math.max(...siblings.map((row) => row.sortOrder)) + 1
    : 0;
  const id = newId("tp");
  await db.insert(topics).values({
    id,
    organizationId: owner.organizationId,
    teacherId: owner.teacherId,
    libraryScope: owner.libraryScope,
    sectionId: null,
    title: source.title,
    subject: source.subject,
    description: source.description,
    programNote: source.programNote,
    status: source.status,
    sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function insertOrigin(
  db: AppDb,
  input: {
    organizationId: string;
    kind: KnowledgeKind;
    materialId: string;
    source: SourceRow;
    authorName: string;
    sourceScope: LibraryScope;
    copiedByUserId: string;
  }
) {
  await db.insert(materialOrigins).values({
    id: newId("ori"),
    organizationId: input.organizationId,
    materialKind: input.kind,
    materialId: input.materialId,
    sourceKind: input.source.kind,
    sourceId: input.source.id,
    sourceTitle: input.source.title,
    sourceAuthorName: input.authorName,
    sourceVersionId: input.source.versionId,
    sourceScope: input.sourceScope,
    copiedAt: new Date(),
    copiedByUserId: input.copiedByUserId,
  });
}

async function lockSource(db: AppDb, kind: KnowledgeKind, id: string) {
  if (kind === "theory") {
    await db.execute(
      sql`select id from theory_materials where id = ${id} for update`
    );
    return;
  }
  if (kind === "test") {
    await db.execute(sql`select id from tests where id = ${id} for update`);
    return;
  }
  await db.execute(sql`select id from topics where id = ${id} for update`);
}

export async function transferKnowledge(
  db: AppDb,
  ctx: AuthContext,
  input: {
    items: TransferItem[];
    teacherIds: string[];
    duplicatePolicy?: "skip" | "create";
    phase?: "plan" | "commit";
  }
): Promise<TransferResult> {
  requireSchoolKnowledgeBase(ctx);
  const phase = input.phase === "plan" ? "plan" : "commit";
  const duplicatePolicy = input.duplicatePolicy === "create" ? "create" : "skip";
  const items = (input.items ?? []).filter((item) => item?.id && item?.kind);
  const teacherIds = [...new Set((input.teacherIds ?? []).filter(Boolean))];
  if (!items.length) throw badRequest("Выберите материалы");
  if (!teacherIds.length) throw badRequest("Выберите преподавателей");
  for (const item of items) {
    if (item.kind !== "theory" && item.kind !== "test" && item.kind !== "topic") {
      throw badRequest("Неизвестный тип материала");
    }
  }

  const teacherRows = await db
    .select({ id: teachers.id, fullName: teachers.fullName, organizationId: teachers.organizationId })
    .from(teachers)
    .where(inArray(teachers.id, teacherIds));
  const teacherById = new Map(teacherRows.map((row) => [row.id, row]));
  const authorName = await schoolAuthorName(db, ctx.organizationId);

  const result: TransferResult = {
    phase,
    planned: 0,
    created: 0,
    skipped: 0,
    duplicates: [],
    failed: [],
  };

  for (const teacherId of teacherIds) {
    const teacher = teacherById.get(teacherId);
    for (const item of items) {
      if (!teacher || teacher.organizationId !== ctx.organizationId) {
        result.failed.push({
          kind: item.kind,
          id: item.id,
          teacherId,
          message: "Преподаватель не найден в этой организации",
        });
        continue;
      }
      try {
        const source = await loadSchoolSource(db, ctx.organizationId, item);
        const existingCopyId = await findExistingCopy(
          db,
          ctx.organizationId,
          item.kind,
          source.id,
          teacherId
        );
        if (existingCopyId && duplicatePolicy === "skip") {
          result.duplicates.push({
            kind: item.kind,
            id: source.id,
            title: source.title,
            teacherId,
            teacherName: teacher.fullName,
            existingCopyId,
          });
          if (phase === "commit") result.skipped += 1;
          continue;
        }
        if (phase === "plan") {
          result.planned += 1;
          continue;
        }

        const writtenKeys: string[] = [];
        let createdThisPair = false;
        try {
          await db.transaction(async (tx) => {
            const transaction = tx as AppDb;
            await lockSource(transaction, item.kind, source.id);
            const again = await findExistingCopy(
              transaction,
              ctx.organizationId,
              item.kind,
              source.id,
              teacherId
            );
            if (again && duplicatePolicy === "skip") {
              result.skipped += 1;
              result.duplicates.push({
                kind: item.kind,
                id: source.id,
                title: source.title,
                teacherId,
                teacherName: teacher.fullName,
                existingCopyId: again,
              });
              return;
            }
            const owner: LibraryOwner = {
              organizationId: ctx.organizationId,
              teacherId,
              libraryScope: "teacher",
            };
            const copyId =
              item.kind === "theory"
                ? await copyTheoryRecord(
                    transaction,
                    source.id,
                    owner,
                    writtenKeys
                  )
                : item.kind === "test"
                  ? await copyTestRecord(transaction, source.id, owner)
                  : await copyTopicRecord(transaction, source.id, owner);
            await insertOrigin(transaction, {
              organizationId: ctx.organizationId,
              kind: item.kind,
              materialId: copyId,
              source,
              authorName,
              sourceScope: "school",
              copiedByUserId: ctx.userId,
            });
            createdThisPair = true;
          });
          if (createdThisPair) result.created += 1;
        } catch (err) {
          await Promise.all(
            writtenKeys.map((key) => deleteTheoryObject(key).catch(() => undefined))
          );
          throw err;
        }
      } catch (err) {
        result.failed.push({
          kind: item.kind,
          id: item.id,
          teacherId,
          message: errorMessage(err),
        });
      }
    }
  }

  if (phase === "plan") {
    result.planned = Math.max(0, items.length * teacherIds.length - result.duplicates.length - result.failed.length);
  }
  return result;
}

export type SaveToSchoolResult = {
  created: boolean;
  id: string;
  kind: KnowledgeKind;
  title: string;
};

export async function saveToSchoolLibrary(
  db: AppDb,
  ctx: AuthContext,
  input: { kind: KnowledgeKind; id: string }
): Promise<SaveToSchoolResult> {
  requireSchoolKnowledgeBase(ctx);
  const kind = input.kind;
  const id = String(input.id ?? "").trim();
  if (!id) throw badRequest("Укажите материал");
  if (kind !== "theory" && kind !== "test" && kind !== "topic") {
    throw badRequest("Неизвестный тип материала");
  }

  const writtenKeys: string[] = [];
  try {
    return await db.transaction(async (tx) => {
      const transaction = tx as AppDb;
      await lockSource(transaction, kind, id);
      const source = await loadTeacherSource(transaction, ctx.organizationId, {
        kind,
        id,
      });
      const existingId = await findExistingSchoolCopy(
        transaction,
        ctx.organizationId,
        kind,
        source.id
      );
      if (existingId) {
        return {
          created: false,
          id: existingId,
          kind,
          title: source.title,
        };
      }
      const owner = schoolOwner(ctx.organizationId);
      const copyId =
        kind === "theory"
          ? await copyTheoryRecord(transaction, source.id, owner, writtenKeys)
          : kind === "test"
            ? await copyTestRecord(transaction, source.id, owner)
            : await copyTopicRecord(transaction, source.id, owner);
      await insertOrigin(transaction, {
        organizationId: ctx.organizationId,
        kind,
        materialId: copyId,
        source,
        authorName: source.authorName || "Преподаватель",
        sourceScope: "teacher",
        copiedByUserId: ctx.userId,
      });
      return { created: true, id: copyId, kind, title: source.title };
    });
  } catch (err) {
    await Promise.all(
      writtenKeys.map((key) => deleteTheoryObject(key).catch(() => undefined))
    );
    throw err;
  }
}

type ListedMaterial = {
  id: string;
  title: string;
  teacherId: string | null;
  libraryScope: LibraryScope;
  status: string;
  updatedAt: string;
  origin: MaterialOrigin | null;
  purpose?: string;
  subject?: string;
};

function withOrigin(
  origins: Map<string, MaterialOrigin>,
  kind: KnowledgeKind,
  row: Omit<ListedMaterial, "origin">
): ListedMaterial {
  return { ...row, origin: origins.get(originKey(kind, row.id)) ?? null };
}

export async function listKnowledgeBase(db: AppDb, ctx: AuthContext) {
  requireSchoolKnowledgeBase(ctx);
  const orgId = ctx.organizationId;
  const [theoryRows, testRows, topicRows, teacherRows, origins] = await Promise.all([
    db.select().from(theoryMaterials).where(eq(theoryMaterials.organizationId, orgId)),
    db.select().from(tests).where(eq(tests.organizationId, orgId)),
    db.select().from(topics).where(eq(topics.organizationId, orgId)),
    db
      .select({
        id: teachers.id,
        fullName: teachers.fullName,
        status: teachers.status,
      })
      .from(teachers)
      .where(eq(teachers.organizationId, orgId)),
    loadOriginMap(db, orgId),
  ]);

  const mapTheory = (row: (typeof theoryRows)[number]) =>
    withOrigin(origins, "theory", {
      id: row.id,
      title: row.title,
      teacherId: row.teacherId,
      libraryScope: row.libraryScope as LibraryScope,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
    });
  const mapTest = (row: (typeof testRows)[number]) =>
    withOrigin(origins, "test", {
      id: row.id,
      title: row.title,
      teacherId: row.teacherId,
      libraryScope: row.libraryScope as LibraryScope,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      purpose: row.purpose,
    });
  const mapTopic = (row: (typeof topicRows)[number]) =>
    withOrigin(origins, "topic", {
      id: row.id,
      title: row.title,
      teacherId: row.teacherId,
      libraryScope: row.libraryScope as LibraryScope,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      subject: row.subject,
    });

  const theories = theoryRows.map(mapTheory);
  const testsMapped = testRows.map(mapTest);
  const topicsMapped = topicRows.map(mapTopic);
  const school = {
    theories: theories.filter((row) => row.libraryScope === "school"),
    tests: testsMapped.filter((row) => row.libraryScope === "school"),
    topics: topicsMapped.filter((row) => row.libraryScope === "school"),
  };
  const staff = teacherRows
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"))
    .map((teacher) => ({
      ...teacher,
      theories: theories.filter((row) => row.teacherId === teacher.id),
      tests: testsMapped.filter((row) => row.teacherId === teacher.id),
      topics: topicsMapped.filter((row) => row.teacherId === teacher.id),
    }));

  return { school, teachers: staff };
}
