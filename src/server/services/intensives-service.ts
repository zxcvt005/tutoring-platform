import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { parseAppInstant } from "@/lib/app-time";
import { parseVideoLink, type TheoryVideoProvider } from "@/lib/theory/video";
import { sniffTheoryFile } from "@/lib/theory/file-sniff";
import type {
  HomeworkAssignmentStatus,
  Intensive,
  IntensiveAssignment,
  IntensiveTestRef,
  LibraryScope,
  TheoryFile,
  TheoryStatus,
} from "@/lib/types";
import {
  canManageSchoolKnowledgeBase,
  isOrgKnowledgeStaff,
} from "@/lib/auth/school-knowledge";
import type { AuthContext } from "@/server/authz/context";
import {
  assertTeacherOwnsStudent,
  requireRoles,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  assignmentSnapshots,
  intensiveAssignmentTests,
  intensiveAssignments,
  intensiveFiles,
  intensiveTests,
  intensiveVersionTests,
  intensiveVersions,
  intensives,
  testAssignments,
  tests,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound } from "@/server/errors";
import {
  deleteTheoryObject,
  getTheoryObject,
  intensiveObjectKey,
  putTheoryObject,
  safeOriginalName,
} from "@/server/media/theory-storage";
import { createTestAssignmentWithSnapshot } from "@/server/services/test-assignment-create";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

const NEED_COMPONENT =
  "Добавьте видео, конспект или хотя бы один тест";

type VideoFields = {
  videoUrl: string | null;
  videoProvider: TheoryVideoProvider | null;
  videoEmbedUrl: string | null;
  embedAllowed: boolean;
  videoWarning: string | null;
};

function videoFieldsFromLink(link: string | null | undefined): VideoFields {
  const raw = link?.trim() ?? "";
  if (!raw) {
    return {
      videoUrl: null,
      videoProvider: null,
      videoEmbedUrl: null,
      embedAllowed: false,
      videoWarning: null,
    };
  }
  const parsed = parseVideoLink(raw);
  if (!parsed.ok) throw badRequest(parsed.error);
  return {
    videoUrl: parsed.originalUrl,
    videoProvider: parsed.provider,
    videoEmbedUrl: parsed.embedUrl,
    embedAllowed: parsed.embedAllowed,
    videoWarning: parsed.warning ?? null,
  };
}

function toFileView(row: typeof intensiveFiles.$inferSelect): TheoryFile {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  };
}

async function loadIntensive(db: AppDb, ctx: AuthContext, id: string) {
  const [row] = await db
    .select()
    .from(intensives)
    .where(eq(intensives.id, id))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) {
    throw notFound("Интенсив не найден");
  }
  return row;
}

async function assertCanManage(
  db: AppDb,
  ctx: AuthContext,
  row: typeof intensives.$inferSelect
) {
  if (row.libraryScope === "school") {
    if (!canManageSchoolKnowledgeBase(ctx.role)) throw forbidden();
    return;
  }
  if (ctx.role === "teacher") {
    const teacherId = await requireTeacherProfile(ctx);
    if (row.teacherId !== teacherId) throw forbidden();
    return;
  }
  if (isOrgKnowledgeStaff(ctx.role)) return;
  throw forbidden();
}

async function draftFiles(db: AppDb, intensiveId: string) {
  return db
    .select()
    .from(intensiveFiles)
    .where(
      and(eq(intensiveFiles.intensiveId, intensiveId), isNull(intensiveFiles.versionId))
    );
}

async function draftTests(db: AppDb, intensiveId: string) {
  return db
    .select()
    .from(intensiveTests)
    .where(eq(intensiveTests.intensiveId, intensiveId))
    .orderBy(asc(intensiveTests.sortOrder));
}

async function ensureTests(
  db: AppDb,
  ctx: AuthContext,
  intensiveId: string,
  owner: { teacherId: string | null; libraryScope: LibraryScope },
  testIds: string[]
) {
  const unique = [...new Set(testIds)];
  if (unique.length !== testIds.length) {
    throw badRequest("Один и тот же тест нельзя прикрепить дважды");
  }
  if (!unique.length) return [];
  const rows = await db
    .select()
    .from(tests)
    .where(
      and(eq(tests.organizationId, ctx.organizationId), inArray(tests.id, unique))
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const testId of unique) {
    const row = byId.get(testId);
    if (!row) throw notFound("Тест не найден");
    if (row.purpose !== "intensive") {
      throw badRequest("Тест нужно создать внутри интенсива");
    }
    if (owner.libraryScope === "school") {
      if (row.libraryScope !== "school" || row.teacherId != null) throw forbidden();
    } else if (row.teacherId !== owner.teacherId) {
      throw forbidden();
    }
    const [otherDraft] = await db
      .select({ intensiveId: intensiveTests.intensiveId })
      .from(intensiveTests)
      .where(
        and(eq(intensiveTests.testId, testId), ne(intensiveTests.intensiveId, intensiveId))
      )
      .limit(1);
    if (otherDraft) throw badRequest("Тест принадлежит другому интенсиву");
    const otherVersions = await db
      .select({ intensiveId: intensiveVersions.intensiveId })
      .from(intensiveVersionTests)
      .innerJoin(
        intensiveVersions,
        eq(intensiveVersions.id, intensiveVersionTests.versionId)
      )
      .where(eq(intensiveVersionTests.testId, testId));
    if (otherVersions.some((link) => link.intensiveId !== intensiveId)) {
      throw badRequest("Тест принадлежит другому интенсиву");
    }
  }
  return unique.map((id) => byId.get(id)!);
}

async function publishOwnedTests(
  db: AppDb,
  rows: { id: string; status: string; questionsPublic: unknown }[]
) {
  for (const row of rows) {
    if (row.status === "published") continue;
    const questions = (row.questionsPublic as { prompt?: string }[]) ?? [];
    if (!questions.length || questions.some((question) => !question.prompt?.trim())) {
      throw badRequest("В каждом тесте интенсива должно быть хотя бы одно задание");
    }
    await db
      .update(tests)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(tests.id, row.id));
  }
}

async function replaceDraftTests(db: AppDb, intensiveId: string, testIds: string[]) {
  await db.delete(intensiveTests).where(eq(intensiveTests.intensiveId, intensiveId));
  if (!testIds.length) return;
  await db.insert(intensiveTests).values(
    testIds.map((testId, sortOrder) => ({
      intensiveId,
      testId,
      sortOrder,
    }))
  );
}

async function snapshotVersion(
  db: AppDb,
  row: typeof intensives.$inferSelect,
  testIds: string[]
) {
  const versionId = newId("inv");
  await db.insert(intensiveVersions).values({
    id: versionId,
    intensiveId: row.id,
    title: row.title,
    description: row.description,
    videoUrl: row.videoUrl,
    videoProvider: row.videoProvider,
    videoEmbedUrl: row.videoEmbedUrl,
    embedAllowed: row.embedAllowed,
    videoWarning: row.videoWarning,
  });
  const files = await draftFiles(db, row.id);
  if (files.length) {
    await db.insert(intensiveFiles).values(
      files.map((file) => ({
        id: newId("inf"),
        organizationId: file.organizationId,
        intensiveId: row.id,
        versionId,
        objectKey: file.objectKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      }))
    );
  }
  if (testIds.length) {
    await db.insert(intensiveVersionTests).values(
      testIds.map((testId, sortOrder) => ({
        versionId,
        testId,
        sortOrder,
      }))
    );
  }
  await db
    .update(intensives)
    .set({ currentVersionId: versionId, status: "published", updatedAt: new Date() })
    .where(eq(intensives.id, row.id));
  return versionId;
}

function fingerprint(input: {
  title: string;
  description: string | null;
  videoUrl: string | null;
  testIds: string[];
  fileKeys: string[];
}) {
  return JSON.stringify({
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    videoUrl: input.videoUrl ?? "",
    testIds: input.testIds,
    files: [...input.fileKeys].sort(),
  });
}

export async function upsertIntensive(
  db: AppDb,
  ctx: AuthContext,
  input: {
    id?: string;
    teacherId?: string;
    libraryScope?: LibraryScope;
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    testIds?: string[];
    publish?: boolean;
  }
) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);
  const id = input.id ?? newId("int");
  const [existing] = await db
    .select()
    .from(intensives)
    .where(eq(intensives.id, id))
    .limit(1);
  if (existing && existing.organizationId !== ctx.organizationId) throw forbidden();
  if (
    existing?.libraryScope === "school" &&
    !canManageSchoolKnowledgeBase(ctx.role)
  ) {
    throw forbidden();
  }

  const requestedScope: LibraryScope =
    input.libraryScope === "school" ? "school" : "teacher";
  const scope: LibraryScope = existing
    ? (existing.libraryScope as LibraryScope)
    : requestedScope;
  if (existing && requestedScope !== scope) {
    throw badRequest("Нельзя сменить владельца интенсива");
  }

  let teacherId: string | null = null;
  if (scope === "school") {
    if (!canManageSchoolKnowledgeBase(ctx.role)) throw forbidden();
  } else if (ctx.role === "teacher") {
    teacherId = await requireTeacherProfile(ctx);
    if (existing && existing.teacherId !== teacherId) throw forbidden();
  } else {
    throw forbidden();
  }

  const title = input.title.trim();
  if (!title) throw badRequest("Укажите название интенсива");
  const video = videoFieldsFromLink(input.videoUrl);
  const testIds = input.testIds ?? (existing ? (await draftTests(db, id)).map((row) => row.testId) : []);
  const owned = await ensureTests(
    db,
    ctx,
    id,
    { teacherId, libraryScope: scope },
    testIds
  );
  const publish = Boolean(input.publish);

  const files = existing ? await draftFiles(db, id) : [];
  if (
    publish &&
    !video.videoUrl &&
    files.length === 0 &&
    testIds.length === 0
  ) {
    throw badRequest(NEED_COMPONENT);
  }

  const nextStatus: TheoryStatus = publish
    ? "published"
    : existing?.status === "published"
      ? "published"
      : "draft";
  const values = {
    title,
    description: input.description?.trim() || null,
    ...video,
    status: nextStatus,
    updatedAt: new Date(),
  };

  if (!existing) {
    await db.insert(intensives).values({
      id,
      organizationId: ctx.organizationId,
      teacherId,
      libraryScope: scope,
      ...values,
    });
  } else {
    await db.update(intensives).set(values).where(eq(intensives.id, id));
  }
  await replaceDraftTests(db, id, testIds);

  const [material] = await db
    .select()
    .from(intensives)
    .where(eq(intensives.id, id))
    .limit(1);
  if (!material) throw notFound("Интенсив не найден");

  if (material.status === "published") {
    const currentFiles = await draftFiles(db, id);
    if (!material.videoUrl && currentFiles.length === 0 && testIds.length === 0) {
      throw badRequest(NEED_COMPONENT);
    }
    await publishOwnedTests(db, owned);
    const currentVersion = material.currentVersionId
      ? (
          await db
            .select()
            .from(intensiveVersions)
            .where(eq(intensiveVersions.id, material.currentVersionId))
            .limit(1)
        )[0]
      : null;
    const versionTests = currentVersion
      ? await db
          .select()
          .from(intensiveVersionTests)
          .where(eq(intensiveVersionTests.versionId, currentVersion.id))
          .orderBy(asc(intensiveVersionTests.sortOrder))
      : [];
    const versionFiles = currentVersion
      ? await db
          .select()
          .from(intensiveFiles)
          .where(eq(intensiveFiles.versionId, currentVersion.id))
      : [];
    const nextFp = fingerprint({
      title: material.title,
      description: material.description,
      videoUrl: material.videoUrl,
      testIds,
      fileKeys: currentFiles.map((file) => file.objectKey),
    });
    const prevFp = currentVersion
      ? fingerprint({
          title: currentVersion.title,
          description: currentVersion.description,
          videoUrl: currentVersion.videoUrl,
          testIds: versionTests.map((row) => row.testId),
          fileKeys: versionFiles.map((file) => file.objectKey),
        })
      : "";
    if (!currentVersion || nextFp !== prevFp) {
      await snapshotVersion(db, material, testIds);
    }
  }

  return { id };
}

export async function deleteIntensive(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);
  const row = await loadIntensive(db, ctx, id);
  await assertCanManage(db, ctx, row);
  const [assigned] = await db
    .select({ id: intensiveAssignments.id })
    .from(intensiveAssignments)
    .where(eq(intensiveAssignments.intensiveId, id))
    .limit(1);
  if (assigned) {
    await db
      .update(intensives)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(intensives.id, id));
    return { ok: true as const, archived: true };
  }
  const files = await db
    .select()
    .from(intensiveFiles)
    .where(eq(intensiveFiles.intensiveId, id));
  await db.delete(intensives).where(eq(intensives.id, id));
  const keys = [...new Set(files.map((file) => file.objectKey))];
  for (const key of keys) {
    const [still] = await db
      .select({ id: intensiveFiles.id })
      .from(intensiveFiles)
      .where(eq(intensiveFiles.objectKey, key))
      .limit(1);
    if (!still) await deleteTheoryObject(key);
  }
  return { ok: true as const, archived: false };
}

export async function assignIntensive(
  db: AppDb,
  ctx: AuthContext,
  input: {
    intensiveId: string;
    studentId: string;
    deadlines: { testId: string; dueAt: string }[];
  }
) {
  requireRoles(ctx, ["teacher"]);
  const teacherId = await requireTeacherProfile(ctx);
  const material = await loadIntensive(db, ctx, input.intensiveId);
  const owns =
    material.libraryScope === "teacher" && material.teacherId === teacherId;
  const shared =
    material.libraryScope === "school" && material.status === "published";
  if (!owns && !shared) throw forbidden();
  if (material.status !== "published" || !material.currentVersionId) {
    throw badRequest("Назначить можно только опубликованный интенсив");
  }
  await assertTeacherOwnsStudent(db, ctx, input.studentId);

  const versionTests = await db
    .select()
    .from(intensiveVersionTests)
    .where(eq(intensiveVersionTests.versionId, material.currentVersionId))
    .orderBy(asc(intensiveVersionTests.sortOrder));
  const deadlines = input.deadlines ?? [];
  if (deadlines.length !== versionTests.length) {
    throw badRequest("Укажите дедлайн для каждого теста");
  }
  const dueByTest = new Map<string, Date>();
  for (const item of deadlines) {
    if (!item?.testId || !item.dueAt?.trim()) {
      throw badRequest("Укажите дедлайн для каждого теста");
    }
    if (dueByTest.has(item.testId)) {
      throw badRequest("Дедлайн для теста указан дважды");
    }
    const dueAt = parseAppInstant(item.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw badRequest("Некорректный дедлайн");
    dueByTest.set(item.testId, dueAt);
  }
  for (const test of versionTests) {
    if (!dueByTest.has(test.testId)) {
      throw badRequest("Укажите дедлайн для каждого теста");
    }
  }

  const [existing] = await db
    .select({ id: intensiveAssignments.id })
    .from(intensiveAssignments)
    .where(
      and(
        eq(intensiveAssignments.intensiveId, material.id),
        eq(intensiveAssignments.studentId, input.studentId)
      )
    )
    .limit(1);
  if (existing) throw badRequest("Этот интенсив уже отправлен ученику");

  const assignmentId = newId("ina");
  await db.transaction(async (tx) => {
    const database = tx as unknown as AppDb;
    await database.insert(intensiveAssignments).values({
      id: assignmentId,
      organizationId: ctx.organizationId,
      intensiveId: material.id,
      versionId: material.currentVersionId!,
      teacherId,
      studentId: input.studentId,
      assignedByUserId: ctx.userId,
    });
    for (const test of versionTests) {
      const dueAt = dueByTest.get(test.testId)!;
      const [source] = await database
        .select({ teacherId: tests.teacherId })
        .from(tests)
        .where(eq(tests.id, test.testId))
        .limit(1);
      const testAssignmentId = await createTestAssignmentWithSnapshot(
        database,
        ctx,
        {
          testId: test.testId,
          teacherId,
          studentId: input.studentId,
          sourceKind: "intensive",
          dueAt,
          status: dueAt.getTime() < Date.now() ? "overdue" : "assigned",
          allowSchoolOriginal: !source?.teacherId,
        }
      );
      await database.insert(intensiveAssignmentTests).values({
        id: newId("iat"),
        assignmentId,
        testId: test.testId,
        sortOrder: test.sortOrder,
        dueAt,
        testAssignmentId,
      });
    }
  });

  return { id: assignmentId };
}

export async function uploadIntensiveFile(
  db: AppDb,
  ctx: AuthContext,
  intensiveId: string,
  file: { bytes: Buffer; filename: string }
) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);
  const row = await loadIntensive(db, ctx, intensiveId);
  await assertCanManage(db, ctx, row);
  let mime: string;
  try {
    mime = sniffTheoryFile(file.bytes, file.filename);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Файл не принят");
  }
  if (mime !== "application/pdf") {
    throw badRequest("Конспект интенсива загружается только в PDF");
  }
  const draft = await draftFiles(db, intensiveId);
  if (draft.length >= 1) {
    throw badRequest("У интенсива может быть один PDF-конспект");
  }
  const originalName = safeOriginalName(file.filename);
  const objectKey = intensiveObjectKey(ctx.organizationId, intensiveId);
  await putTheoryObject(objectKey, file.bytes, mime);
  const id = newId("inf");
  await db.insert(intensiveFiles).values({
    id,
    organizationId: ctx.organizationId,
    intensiveId,
    versionId: null,
    objectKey,
    originalName,
    mimeType: mime,
    sizeBytes: file.bytes.length,
  });
  await db
    .update(intensives)
    .set({ updatedAt: new Date() })
    .where(eq(intensives.id, intensiveId));
  return { id, originalName, mimeType: mime, sizeBytes: file.bytes.length };
}

export async function removeIntensiveDraftFile(
  db: AppDb,
  ctx: AuthContext,
  intensiveId: string,
  fileId: string
) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);
  const row = await loadIntensive(db, ctx, intensiveId);
  await assertCanManage(db, ctx, row);
  const [file] = await db
    .select()
    .from(intensiveFiles)
    .where(
      and(
        eq(intensiveFiles.id, fileId),
        eq(intensiveFiles.intensiveId, intensiveId),
        isNull(intensiveFiles.versionId)
      )
    )
    .limit(1);
  if (!file) throw notFound("Файл не найден");
  await db.delete(intensiveFiles).where(eq(intensiveFiles.id, fileId));
  const [still] = await db
    .select({ id: intensiveFiles.id })
    .from(intensiveFiles)
    .where(eq(intensiveFiles.objectKey, file.objectKey))
    .limit(1);
  if (!still) await deleteTheoryObject(file.objectKey);
  await db
    .update(intensives)
    .set({ updatedAt: new Date() })
    .where(eq(intensives.id, intensiveId));
  return { ok: true as const };
}

export async function getIntensiveFileForViewer(
  db: AppDb,
  ctx: AuthContext,
  fileId: string
) {
  const [file] = await db
    .select()
    .from(intensiveFiles)
    .where(eq(intensiveFiles.id, fileId))
    .limit(1);
  if (!file || file.organizationId !== ctx.organizationId) {
    throw notFound("Файл не найден");
  }
  const material = await loadIntensive(db, ctx, file.intensiveId);
  if (isOrgKnowledgeStaff(ctx.role)) {
    await assertCanManage(db, ctx, material);
  } else if (ctx.role === "teacher") {
    const teacherId = await requireTeacherProfile(ctx);
    const owns = material.teacherId === teacherId;
    const shared = material.libraryScope === "school" && material.status === "published";
    const [assigned] = await db
      .select({ id: intensiveAssignments.id })
      .from(intensiveAssignments)
      .where(
        and(
          eq(intensiveAssignments.intensiveId, material.id),
          eq(intensiveAssignments.teacherId, teacherId)
        )
      )
      .limit(1);
    if (!owns && !shared && !assigned) throw forbidden();
    if (!file.versionId && !owns && ctx.role === "teacher" && material.libraryScope === "school") {
      throw forbidden();
    }
  } else if (ctx.role === "student") {
    if (!ctx.studentId || !file.versionId) throw forbidden();
    const [assignment] = await db
      .select()
      .from(intensiveAssignments)
      .where(
        and(
          eq(intensiveAssignments.intensiveId, material.id),
          eq(intensiveAssignments.studentId, ctx.studentId),
          eq(intensiveAssignments.versionId, file.versionId)
        )
      )
      .limit(1);
    if (!assignment) throw forbidden();
    const { assertStudentLearningAccess } = await import(
      "@/server/services/learning-access"
    );
    await assertStudentLearningAccess(db, ctx, ctx.studentId, "homework");
  } else {
    throw forbidden();
  }
  const bytes = await getTheoryObject(file.objectKey);
  return {
    bytes,
    mimeType: file.mimeType,
    originalName: file.originalName,
  };
}

export async function listIntensivesForBootstrap(
  db: AppDb,
  ctx: AuthContext
): Promise<{ intensives: Intensive[]; intensiveAssignments: IntensiveAssignment[] }> {
  if (ctx.role === "press" || (ctx.role === "student" && !ctx.studentId)) {
    return { intensives: [], intensiveAssignments: [] };
  }

  let materialRows = await db
    .select()
    .from(intensives)
    .where(eq(intensives.organizationId, ctx.organizationId));
  let assignmentRows = await db
    .select()
    .from(intensiveAssignments)
    .where(eq(intensiveAssignments.organizationId, ctx.organizationId));

  if (ctx.role === "teacher") {
    if (!ctx.teacherId) return { intensives: [], intensiveAssignments: [] };
    const teacherId = ctx.teacherId;
    assignmentRows = assignmentRows.filter((row) => row.teacherId === teacherId);
    const assignedIds = new Set(assignmentRows.map((row) => row.intensiveId));
    materialRows = materialRows.filter(
      (row) =>
        row.teacherId === teacherId ||
        (row.libraryScope === "school" && row.status === "published") ||
        assignedIds.has(row.id)
    );
  } else if (ctx.role === "student" && ctx.studentId) {
    assignmentRows = assignmentRows.filter((row) => row.studentId === ctx.studentId);
    const ids = new Set(assignmentRows.map((row) => row.intensiveId));
    materialRows = materialRows.filter((row) => ids.has(row.id));
  } else if (!canManageSchoolKnowledgeBase(ctx.role)) {
    return { intensives: [], intensiveAssignments: [] };
  }

  const materialIds = materialRows.map((row) => row.id);
  const versionIds = [
    ...new Set(
      assignmentRows
        .map((row) => row.versionId)
        .concat(
          materialRows
            .map((row) => row.currentVersionId)
            .filter((id): id is string => Boolean(id))
        )
    ),
  ];
  const fileRows = materialIds.length
    ? await db
        .select()
        .from(intensiveFiles)
        .where(inArray(intensiveFiles.intensiveId, materialIds))
    : [];
  const draftTestRows = materialIds.length
    ? await db
        .select()
        .from(intensiveTests)
        .where(inArray(intensiveTests.intensiveId, materialIds))
        .orderBy(asc(intensiveTests.sortOrder))
    : [];
  const versionTestRows = versionIds.length
    ? await db
        .select()
        .from(intensiveVersionTests)
        .where(inArray(intensiveVersionTests.versionId, versionIds))
        .orderBy(asc(intensiveVersionTests.sortOrder))
    : [];
  const versionRows = versionIds.length
    ? await db
        .select()
        .from(intensiveVersions)
        .where(inArray(intensiveVersions.id, versionIds))
    : [];
  const linkRows = assignmentRows.length
    ? await db
        .select()
        .from(intensiveAssignmentTests)
        .where(
          inArray(
            intensiveAssignmentTests.assignmentId,
            assignmentRows.map((row) => row.id)
          )
        )
        .orderBy(asc(intensiveAssignmentTests.sortOrder))
    : [];
  const attemptIds = linkRows.map((row) => row.testAssignmentId);
  const attemptRows = attemptIds.length
    ? await db
        .select()
        .from(testAssignments)
        .where(inArray(testAssignments.id, attemptIds))
    : [];
  const snapRows = attemptIds.length
    ? await db
        .select()
        .from(assignmentSnapshots)
        .where(inArray(assignmentSnapshots.assignmentId, attemptIds))
    : [];
  const testIds = [
    ...new Set([
      ...draftTestRows.map((row) => row.testId),
      ...versionTestRows.map((row) => row.testId),
      ...linkRows.map((row) => row.testId),
    ]),
  ];
  const testRows = testIds.length
    ? await db.select().from(tests).where(inArray(tests.id, testIds))
    : [];
  const testTitle = new Map(testRows.map((row) => [row.id, row.title]));
  const snapTitle = new Map(snapRows.map((row) => [row.assignmentId, row.title]));
  const attemptById = new Map(attemptRows.map((row) => [row.id, row]));
  const versionById = new Map(versionRows.map((row) => [row.id, row]));

  const assignedCount = new Map<string, number>();
  for (const row of assignmentRows) {
    assignedCount.set(row.intensiveId, (assignedCount.get(row.intensiveId) ?? 0) + 1);
  }

  const visible: Intensive[] = materialRows.map((row) => {
    const files = fileRows.filter(
      (file) => file.intensiveId === row.id && file.versionId == null
    );
    const testsForDraft: IntensiveTestRef[] = draftTestRows
      .filter((test) => test.intensiveId === row.id)
      .map((test) => ({
        testId: test.testId,
        title: testTitle.get(test.testId) ?? "Тест",
        sortOrder: test.sortOrder,
      }));
    return {
      id: row.id,
      teacherId: row.teacherId ?? "",
      libraryScope: row.libraryScope as LibraryScope,
      folderId: row.folderId ?? null,
      title: row.title,
      description: row.description ?? undefined,
      videoUrl: row.videoUrl,
      videoProvider: row.videoProvider as Intensive["videoProvider"],
      videoEmbedUrl: row.videoEmbedUrl,
      embedAllowed: row.embedAllowed,
      videoWarning: row.videoWarning,
      status: row.status as TheoryStatus,
      tests: testsForDraft,
      fileCount: files.length,
      assignedCount: assignedCount.get(row.id) ?? 0,
      currentVersionId: row.currentVersionId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      files:
        ctx.role === "teacher" || isOrgKnowledgeStaff(ctx.role)
          ? files.map(toFileView)
          : undefined,
    };
  });

  const intensiveAssignmentsMapped: IntensiveAssignment[] = assignmentRows.map(
    (row) => {
      const version = versionById.get(row.versionId);
      const files = fileRows.filter((file) => file.versionId === row.versionId);
      const testsForAssignment = linkRows
        .filter((link) => link.assignmentId === row.id)
        .map((link) => {
          const attempt = attemptById.get(link.testAssignmentId);
          return {
            testId: link.testId,
            title:
              snapTitle.get(link.testAssignmentId) ??
              testTitle.get(link.testId) ??
              "Тест",
            sortOrder: link.sortOrder,
            dueAt: link.dueAt.toISOString(),
            testAssignmentId: link.testAssignmentId,
            status: (attempt?.status as HomeworkAssignmentStatus) ?? "assigned",
            score: attempt?.score != null ? Number(attempt.score) : null,
            maxScore: attempt?.maxScore != null ? Number(attempt.maxScore) : null,
            completedAt: attempt?.completedAt?.toISOString() ?? null,
          };
        });
      return {
        id: row.id,
        intensiveId: row.intensiveId,
        versionId: row.versionId,
        teacherId: row.teacherId,
        studentId: row.studentId,
        assignedAt: row.createdAt.toISOString(),
        title: version?.title ?? "Интенсив",
        description: version?.description ?? null,
        videoUrl: version?.videoUrl ?? null,
        videoProvider: (version?.videoProvider as IntensiveAssignment["videoProvider"]) ?? null,
        videoEmbedUrl: version?.videoEmbedUrl ?? null,
        embedAllowed: version?.embedAllowed ?? false,
        videoWarning: version?.videoWarning ?? null,
        files: files.map(toFileView),
        tests: testsForAssignment,
      };
    }
  );

  return { intensives: visible, intensiveAssignments: intensiveAssignmentsMapped };
}
