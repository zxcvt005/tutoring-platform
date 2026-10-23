import { and, eq, inArray, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { THEORY_MAX_FILES } from "@/lib/theory/constants";
import { sniffTheoryFile } from "@/lib/theory/file-sniff";
import { parseVideoLink, type TheoryVideoProvider } from "@/lib/theory/video";
import type {
  HomeworkAssignmentStatus,
  TheoryAssignment,
  TheoryAssignmentStatus,
  TheoryFile,
  TheoryMaterial,
  TheoryStatus,
} from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  assertTeacherOwnsStudent,
  requireRoles,
  requireStudentProfile,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  testAssignments,
  tests,
  theoryAssignments,
  theoryFiles,
  theoryMaterialVersions,
  theoryMaterials,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound } from "@/server/errors";
import {
  deleteTheoryObject,
  getTheoryObject,
  putTheoryObject,
  safeOriginalName,
  theoryObjectKey,
} from "@/server/media/theory-storage";
import { recordChatSystemEventSafe } from "@/server/services/chat-events";
import { createTestAssignmentWithSnapshot } from "@/server/services/test-assignment-create";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

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

async function loadMaterialInOrg(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  const [row] = await db
    .select()
    .from(theoryMaterials)
    .where(
      and(
        eq(theoryMaterials.id, id),
        eq(theoryMaterials.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Теория не найдена");
  return row;
}

async function assertTeacherOwnsMaterial(
  db: AppDb,
  ctx: AuthContext,
  material: { teacherId: string }
) {
  const teacherId = await requireTeacherProfile(ctx);
  if (material.teacherId !== teacherId) throw forbidden();
  return teacherId;
}

async function loadVersion(db: AppDb, versionId: string) {
  const [row] = await db
    .select()
    .from(theoryMaterialVersions)
    .where(eq(theoryMaterialVersions.id, versionId))
    .limit(1);
  if (!row) throw notFound("Версия теории не найдена");
  return row;
}

async function currentDraftFiles(db: AppDb, materialId: string) {
  return db
    .select()
    .from(theoryFiles)
    .where(
      and(eq(theoryFiles.materialId, materialId), isNull(theoryFiles.versionId))
    );
}

async function filesForVersion(db: AppDb, versionId: string) {
  return db
    .select()
    .from(theoryFiles)
    .where(eq(theoryFiles.versionId, versionId));
}

function toFileView(row: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}): TheoryFile {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  };
}

async function snapshotDraftFilesToVersion(
  db: AppDb,
  materialId: string,
  versionId: string
) {
  const draft = await currentDraftFiles(db, materialId);
  if (draft.length === 0) return;
  await db.insert(theoryFiles).values(
    draft.map((file) => ({
      id: newId("thf"),
      organizationId: file.organizationId,
      materialId,
      versionId,
      objectKey: file.objectKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    }))
  );
}

async function maybeDeleteOrphanObject(db: AppDb, objectKey: string) {
  const [still] = await db
    .select({ id: theoryFiles.id })
    .from(theoryFiles)
    .where(eq(theoryFiles.objectKey, objectKey))
    .limit(1);
  if (still) return;
  await deleteTheoryObject(objectKey);
}

async function createPublishedVersion(
  db: AppDb,
  material: { id: string; title: string } & VideoFields & { testId: string | null; description: string | null }
) {
  if (!material.videoUrl) {
    throw badRequest("Для публикации укажите ссылку на видео");
  }
  const versionId = newId("thv");
  await db.insert(theoryMaterialVersions).values({
    id: versionId,
    materialId: material.id,
    title: material.title,
    description: material.description,
    videoUrl: material.videoUrl,
    videoProvider: material.videoProvider,
    videoEmbedUrl: material.videoEmbedUrl,
    embedAllowed: material.embedAllowed,
    videoWarning: material.videoWarning,
    testId: material.testId,
    publishedAt: new Date(),
  });
  await snapshotDraftFilesToVersion(db, material.id, versionId);
  await db
    .update(theoryMaterials)
    .set({
      currentVersionId: versionId,
      status: "published",
      updatedAt: new Date(),
    })
    .where(eq(theoryMaterials.id, material.id));
  return versionId;
}

function contentFingerprint(input: {
  title: string;
  description: string | null;
  videoUrl: string | null;
  testId: string | null;
  fileIds: string[];
}) {
  return JSON.stringify({
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    videoUrl: input.videoUrl ?? "",
    testId: input.testId ?? "",
    files: [...input.fileIds].sort(),
  });
}

async function ensureTestOwned(
  db: AppDb,
  ctx: AuthContext,
  teacherId: string,
  testId: string | null | undefined
) {
  if (!testId) return null;
  const [row] = await db
    .select()
    .from(tests)
    .where(
      and(eq(tests.id, testId), eq(tests.organizationId, ctx.organizationId))
    )
    .limit(1);
  if (!row) throw notFound("Тест не найден");
  if (row.teacherId !== teacherId) throw forbidden();
  return row;
}

export async function upsertTheory(
  db: AppDb,
  ctx: AuthContext,
  input: {
    id?: string;
    teacherId: string;
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    testId?: string | null;
    status?: TheoryStatus;
    publish?: boolean;
  }
) {
  requireRoles(ctx, ["teacher"]);
  const teacherId = await requireTeacherProfile(ctx);
  if (input.teacherId !== teacherId) throw forbidden();

  const title = input.title.trim();
  if (!title) throw badRequest("Укажите название теории");
  const video = videoFieldsFromLink(input.videoUrl);
  const testId = input.testId?.trim() || null;
  await ensureTestOwned(db, ctx, teacherId, testId);
  if (testId) {
    const [test] = await db
      .select({ status: tests.status })
      .from(tests)
      .where(eq(tests.id, testId))
      .limit(1);
    if (test && test.status !== "published" && input.publish) {
      throw badRequest("Сначала опубликуйте тест, затем прикрепите его к теории");
    }
  }

  const id = input.id ?? newId("thm");
  const [existing] = await db
    .select()
    .from(theoryMaterials)
    .where(eq(theoryMaterials.id, id))
    .limit(1);

  const publish = Boolean(input.publish);
  const nextStatus: TheoryStatus = publish
    ? "published"
    : existing?.status === "published" && input.status !== "archived"
      ? "published"
      : input.status === "archived"
        ? "archived"
        : "draft";

  if (publish && !video.videoUrl) {
    throw badRequest("Для публикации укажите ссылку на видео");
  }

  const values = {
    title,
    description: input.description?.trim() || null,
    ...video,
    testId,
    status: nextStatus,
    updatedAt: new Date(),
  };

  if (!existing) {
    await db.insert(theoryMaterials).values({
      id,
      organizationId: ctx.organizationId,
      teacherId,
      ...values,
    });
  } else {
    if (existing.organizationId !== ctx.organizationId) throw forbidden();
    if (existing.teacherId !== teacherId) throw forbidden();
    await db
      .update(theoryMaterials)
      .set(values)
      .where(eq(theoryMaterials.id, id));
  }

  const [material] = await db
    .select()
    .from(theoryMaterials)
    .where(eq(theoryMaterials.id, id))
    .limit(1);
  if (!material) throw notFound("Теория не найдена");

  if (publish || (material.status === "published" && video.videoUrl)) {
    const draftFiles = await currentDraftFiles(db, id);
    const currentVersion = material.currentVersionId
      ? await loadVersion(db, material.currentVersionId)
      : null;
    const nextFp = contentFingerprint({
      title: material.title,
      description: material.description,
      videoUrl: material.videoUrl,
      testId: material.testId,
      fileIds: draftFiles.map((f) => f.objectKey),
    });
    const prevFp = currentVersion
      ? contentFingerprint({
          title: currentVersion.title,
          description: currentVersion.description,
          videoUrl: currentVersion.videoUrl,
          testId: currentVersion.testId,
          fileIds: (await filesForVersion(db, currentVersion.id)).map(
            (f) => f.objectKey
          ),
        })
      : "";
    if (!currentVersion || nextFp !== prevFp) {
      await createPublishedVersion(db, {
        id: material.id,
        title: material.title,
        description: material.description,
        videoUrl: material.videoUrl,
        videoProvider: material.videoProvider as TheoryVideoProvider | null,
        videoEmbedUrl: material.videoEmbedUrl,
        embedAllowed: material.embedAllowed,
        videoWarning: material.videoWarning,
        testId: material.testId,
      });
    }
  }

  return { id };
}

export async function deleteTheory(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["teacher"]);
  const material = await loadMaterialInOrg(db, ctx, id);
  await assertTeacherOwnsMaterial(db, ctx, material);
  const [assigned] = await db
    .select({ id: theoryAssignments.id })
    .from(theoryAssignments)
    .where(eq(theoryAssignments.materialId, id))
    .limit(1);
  if (assigned) {
    await db
      .update(theoryMaterials)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(theoryMaterials.id, id));
    return { ok: true as const, archived: true };
  }
  const files = await db
    .select()
    .from(theoryFiles)
    .where(eq(theoryFiles.materialId, id));
  await db.delete(theoryMaterials).where(eq(theoryMaterials.id, id));
  const keys = [...new Set(files.map((f) => f.objectKey))];
  for (const key of keys) {
    await maybeDeleteOrphanObject(db, key);
  }
  return { ok: true as const, archived: false };
}

export async function assignTheory(
  db: AppDb,
  ctx: AuthContext,
  input: { materialId: string; studentIds: string[] }
) {
  requireRoles(ctx, ["teacher"]);
  const teacherId = await requireTeacherProfile(ctx);
  const material = await loadMaterialInOrg(db, ctx, input.materialId);
  if (material.teacherId !== teacherId) throw forbidden();
  if (material.status !== "published" || !material.currentVersionId) {
    throw badRequest("Назначить можно только опубликованную теорию");
  }
  const version = await loadVersion(db, material.currentVersionId);
  if (!version.videoUrl) {
    throw badRequest("У опубликованной теории должно быть видео");
  }

  const studentIds = [...new Set(input.studentIds.filter(Boolean))];
  if (!studentIds.length) throw badRequest("Выберите учеников");

  let created = 0;
  let skipped = 0;
  for (const studentId of studentIds) {
    await assertTeacherOwnsStudent(db, ctx, studentId);
    const [existing] = await db
      .select()
      .from(theoryAssignments)
      .where(
        and(
          eq(theoryAssignments.materialId, material.id),
          eq(theoryAssignments.studentId, studentId)
        )
      )
      .limit(1);
    if (existing) {
      skipped += 1;
      continue;
    }
    const assignmentId = newId("tha");
    await db.insert(theoryAssignments).values({
      id: assignmentId,
      organizationId: ctx.organizationId,
      materialId: material.id,
      versionId: version.id,
      teacherId,
      studentId,
      assignedByUserId: ctx.userId,
      status: "assigned",
    });
    await recordChatSystemEventSafe(db, {
      organizationId: ctx.organizationId,
      studentId,
      teacherId,
      eventType: "theory_assigned",
      eventKey: `theory_assigned:${assignmentId}`,
      title: `Новая теория: ${version.title}`,
      theoryAssignmentId: assignmentId,
      theoryTitle: version.title,
    });
    created += 1;
  }
  return { ok: true as const, created, skipped };
}

async function ensureTheoryTestAssignment(
  db: AppDb,
  ctx: AuthContext,
  assignment: typeof theoryAssignments.$inferSelect,
  version: typeof theoryMaterialVersions.$inferSelect
) {
  if (!version.testId) return null;
  if (assignment.testAssignmentId) return assignment.testAssignmentId;
  const testAssignmentId = await createTestAssignmentWithSnapshot(db, ctx, {
    testId: version.testId,
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    sourceKind: "theory",
  });
  await db
    .update(theoryAssignments)
    .set({ testAssignmentId, updatedAt: new Date() })
    .where(eq(theoryAssignments.id, assignment.id));
  return testAssignmentId;
}

export async function markTheoryViewed(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string
) {
  const studentId = await requireStudentProfile(ctx);
  const [assignment] = await db
    .select()
    .from(theoryAssignments)
    .where(
      and(
        eq(theoryAssignments.id, assignmentId),
        eq(theoryAssignments.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!assignment) throw notFound("Назначение не найдено");
  if (assignment.studentId !== studentId) throw forbidden();

  const version = await loadVersion(db, assignment.versionId);
  const now = new Date();
  const alreadyViewed = Boolean(assignment.viewedAt);

  let testAssignmentId = assignment.testAssignmentId;
  if (version.testId && !testAssignmentId) {
    testAssignmentId = await ensureTheoryTestAssignment(
      db,
      ctx,
      assignment,
      version
    );
  }

  let status: TheoryAssignmentStatus = assignment.status as TheoryAssignmentStatus;
  let completedAt = assignment.completedAt;
  if (!version.testId) {
    status = "completed";
    completedAt = assignment.completedAt ?? now;
  } else if (status === "assigned") {
    status = "viewed";
  }

  if (!alreadyViewed || assignment.status !== status) {
    await db
      .update(theoryAssignments)
      .set({
        viewedAt: assignment.viewedAt ?? now,
        status,
        completedAt,
        testAssignmentId,
        updatedAt: now,
      })
      .where(eq(theoryAssignments.id, assignment.id));
  }

  if (!version.testId && status === "completed") {
    await recordChatSystemEventSafe(db, {
      organizationId: ctx.organizationId,
      studentId: assignment.studentId,
      teacherId: assignment.teacherId,
      eventType: "theory_completed",
      eventKey: `theory_completed:${assignment.id}`,
      title: `Теория пройдена: ${version.title}`,
      theoryAssignmentId: assignment.id,
      theoryTitle: version.title,
    });
  }

  return {
    ok: true as const,
    status,
    testAssignmentId: testAssignmentId ?? null,
    alreadyViewed,
  };
}

export async function syncTheoryProgressFromTest(
  db: AppDb,
  testAssignmentId: string,
  testStatus: string
) {
  const [assignment] = await db
    .select()
    .from(theoryAssignments)
    .where(eq(theoryAssignments.testAssignmentId, testAssignmentId))
    .limit(1);
  if (!assignment) return;

  let status: TheoryAssignmentStatus = assignment.status as TheoryAssignmentStatus;
  let completedAt = assignment.completedAt;
  if (testStatus === "reviewed") {
    status = "completed";
    completedAt = assignment.completedAt ?? new Date();
  } else if (testStatus === "completed") {
    status = "awaiting_review";
  } else if (
    testStatus === "in_progress" ||
    testStatus === "remaining_questions" ||
    testStatus === "attempt1_submitted" ||
    testStatus === "attempt2_in_progress"
  ) {
    status = assignment.viewedAt ? "in_progress" : "assigned";
  }

  await db
    .update(theoryAssignments)
    .set({ status, completedAt, updatedAt: new Date() })
    .where(eq(theoryAssignments.id, assignment.id));

  const version = await loadVersion(db, assignment.versionId);
  if (status === "awaiting_review") {
    await recordChatSystemEventSafe(db, {
      organizationId: assignment.organizationId,
      studentId: assignment.studentId,
      teacherId: assignment.teacherId,
      eventType: "theory_awaiting_review",
      eventKey: `theory_awaiting_review:${assignment.id}`,
      title: `Теория ожидает проверки: ${version.title}`,
      theoryAssignmentId: assignment.id,
      theoryTitle: version.title,
      assignmentId: testAssignmentId,
    });
  }
  if (status === "completed") {
    await recordChatSystemEventSafe(db, {
      organizationId: assignment.organizationId,
      studentId: assignment.studentId,
      teacherId: assignment.teacherId,
      eventType: "theory_completed",
      eventKey: `theory_completed:${assignment.id}`,
      title: `Теория пройдена: ${version.title}`,
      theoryAssignmentId: assignment.id,
      theoryTitle: version.title,
      assignmentId: testAssignmentId,
    });
  }
}

export async function uploadTheoryFile(
  db: AppDb,
  ctx: AuthContext,
  materialId: string,
  file: { bytes: Buffer; filename: string }
) {
  requireRoles(ctx, ["teacher"]);
  const material = await loadMaterialInOrg(db, ctx, materialId);
  await assertTeacherOwnsMaterial(db, ctx, material);
  const mime = sniffTheoryFile(file.bytes, file.filename);
  const draft = await currentDraftFiles(db, materialId);
  if (draft.length >= THEORY_MAX_FILES) {
    throw badRequest(`Можно прикрепить не больше ${THEORY_MAX_FILES} файлов`);
  }
  const originalName = safeOriginalName(file.filename);
  const objectKey = theoryObjectKey(ctx.organizationId, materialId, mime);
  await putTheoryObject(objectKey, file.bytes, mime);
  const id = newId("thf");
  await db.insert(theoryFiles).values({
    id,
    organizationId: ctx.organizationId,
    materialId,
    versionId: null,
    objectKey,
    originalName,
    mimeType: mime,
    sizeBytes: file.bytes.length,
  });
  await db
    .update(theoryMaterials)
    .set({ updatedAt: new Date() })
    .where(eq(theoryMaterials.id, materialId));
  return { id, originalName, mimeType: mime, sizeBytes: file.bytes.length };
}

export async function removeTheoryDraftFile(
  db: AppDb,
  ctx: AuthContext,
  materialId: string,
  fileId: string
) {
  requireRoles(ctx, ["teacher"]);
  const material = await loadMaterialInOrg(db, ctx, materialId);
  await assertTeacherOwnsMaterial(db, ctx, material);
  const [file] = await db
    .select()
    .from(theoryFiles)
    .where(
      and(
        eq(theoryFiles.id, fileId),
        eq(theoryFiles.materialId, materialId),
        isNull(theoryFiles.versionId)
      )
    )
    .limit(1);
  if (!file) throw notFound("Файл не найден");
  await db.delete(theoryFiles).where(eq(theoryFiles.id, fileId));
  await maybeDeleteOrphanObject(db, file.objectKey);
  await db
    .update(theoryMaterials)
    .set({ updatedAt: new Date() })
    .where(eq(theoryMaterials.id, materialId));
  return { ok: true as const };
}

export async function getTheoryFileForViewer(
  db: AppDb,
  ctx: AuthContext,
  fileId: string
) {
  const [file] = await db
    .select()
    .from(theoryFiles)
    .where(eq(theoryFiles.id, fileId))
    .limit(1);
  if (!file || file.organizationId !== ctx.organizationId) {
    throw notFound("Файл не найден");
  }
  const material = await loadMaterialInOrg(db, ctx, file.materialId);
  if (ctx.role === "teacher") {
    if (ctx.teacherId !== material.teacherId) throw forbidden();
  } else if (ctx.role === "student") {
    if (!ctx.studentId) throw forbidden();
    const [assignment] = await db
      .select()
      .from(theoryAssignments)
      .where(
        and(
          eq(theoryAssignments.materialId, material.id),
          eq(theoryAssignments.studentId, ctx.studentId)
        )
      )
      .limit(1);
    if (!assignment) throw forbidden();
    if (file.versionId && file.versionId !== assignment.versionId) {
      throw forbidden();
    }
    if (!file.versionId) throw forbidden();
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

function mapMaterial(
  row: typeof theoryMaterials.$inferSelect,
  extra: {
    fileCount: number;
    assignedCount: number;
    completedCount: number;
    awaitingReviewCount: number;
    files?: TheoryFile[];
  }
): TheoryMaterial {
  return {
    id: row.id,
    teacherId: row.teacherId,
    title: row.title,
    description: row.description ?? undefined,
    videoUrl: row.videoUrl,
    videoProvider: row.videoProvider as TheoryMaterial["videoProvider"],
    videoEmbedUrl: row.videoEmbedUrl,
    embedAllowed: row.embedAllowed,
    videoWarning: row.videoWarning,
    status: row.status as TheoryStatus,
    testId: row.testId,
    hasTest: Boolean(row.testId),
    hasVideo: Boolean(row.videoUrl),
    fileCount: extra.fileCount,
    assignedCount: extra.assignedCount,
    completedCount: extra.completedCount,
    awaitingReviewCount: extra.awaitingReviewCount,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    files: extra.files,
  };
}

export async function listTheoryMaterialsForBootstrap(
  db: AppDb,
  ctx: AuthContext
): Promise<{
  theories: TheoryMaterial[];
  theoryAssignments: TheoryAssignment[];
}> {
  let materialRows =
    ctx.role === "director"
      ? []
      : await db
          .select()
          .from(theoryMaterials)
          .where(eq(theoryMaterials.organizationId, ctx.organizationId));

  let assignmentRows = await db
    .select()
    .from(theoryAssignments)
    .where(eq(theoryAssignments.organizationId, ctx.organizationId));

  if (ctx.role === "teacher" && ctx.teacherId) {
    materialRows = materialRows.filter((m) => m.teacherId === ctx.teacherId);
    assignmentRows = assignmentRows.filter((a) => a.teacherId === ctx.teacherId);
  }
  if (ctx.role === "student" && ctx.studentId) {
    assignmentRows = assignmentRows.filter((a) => a.studentId === ctx.studentId);
    const materialIds = new Set(assignmentRows.map((a) => a.materialId));
    materialRows = materialRows.filter(
      (m) => materialIds.has(m.id) && m.status !== "draft"
    );
  }

  const materialIds = materialRows.map((m) => m.id);
  const versionIds = [
    ...new Set(
      assignmentRows
        .map((a) => a.versionId)
        .concat(materialRows.map((m) => m.currentVersionId).filter(Boolean) as string[])
    ),
  ];
  const fileRows =
    materialIds.length > 0
      ? await db
          .select()
          .from(theoryFiles)
          .where(inArray(theoryFiles.materialId, materialIds))
      : [];
  const versionRows =
    versionIds.length > 0
      ? await db
          .select()
          .from(theoryMaterialVersions)
          .where(inArray(theoryMaterialVersions.id, versionIds))
      : [];
  const versionById = new Map(versionRows.map((v) => [v.id, v]));

  const testAssignmentIds = assignmentRows
    .map((a) => a.testAssignmentId)
    .filter((id): id is string => Boolean(id));
  const testRows =
    testAssignmentIds.length > 0
      ? await db
          .select()
          .from(testAssignments)
          .where(inArray(testAssignments.id, testAssignmentIds))
      : [];
  const testById = new Map(testRows.map((t) => [t.id, t]));

  const assignedCount = new Map<string, number>();
  const completedCount = new Map<string, number>();
  const awaitingCount = new Map<string, number>();
  for (const a of assignmentRows) {
    assignedCount.set(a.materialId, (assignedCount.get(a.materialId) ?? 0) + 1);
    if (a.status === "completed") {
      completedCount.set(
        a.materialId,
        (completedCount.get(a.materialId) ?? 0) + 1
      );
    }
    if (a.status === "awaiting_review") {
      awaitingCount.set(
        a.materialId,
        (awaitingCount.get(a.materialId) ?? 0) + 1
      );
    }
  }

  const theories: TheoryMaterial[] = materialRows.map((m) => {
    const files = fileRows.filter(
      (f) => f.materialId === m.id && f.versionId == null
    );
    return mapMaterial(m, {
      fileCount: files.length,
      assignedCount: assignedCount.get(m.id) ?? 0,
      completedCount: completedCount.get(m.id) ?? 0,
      awaitingReviewCount: awaitingCount.get(m.id) ?? 0,
      files:
        ctx.role === "teacher" || ctx.role === "director"
          ? files.map(toFileView)
          : undefined,
    });
  });

  const theoryAssignmentsMapped: TheoryAssignment[] = assignmentRows.map((a) => {
    const version = versionById.get(a.versionId);
    const files = fileRows
      .filter((f) => f.versionId === a.versionId)
      .map(toFileView);
    const test = a.testAssignmentId ? testById.get(a.testAssignmentId) : null;
    const percent =
      test?.attempt2Percent != null
        ? Number(test.attempt2Percent)
        : test?.attempt1Percent != null
          ? Number(test.attempt1Percent)
          : test?.score != null
            ? Number(test.score)
            : null;
    return {
      id: a.id,
      materialId: a.materialId,
      versionId: a.versionId,
      teacherId: a.teacherId,
      studentId: a.studentId,
      status: a.status as TheoryAssignmentStatus,
      assignedAt: a.createdAt.toISOString(),
      viewedAt: a.viewedAt?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
      testAssignmentId: a.testAssignmentId,
      title: version?.title ?? "Теория",
      description: version?.description ?? null,
      videoUrl: version?.videoUrl ?? "",
      videoProvider: (version?.videoProvider ?? null) as TheoryAssignment["videoProvider"],
      videoEmbedUrl: version?.videoEmbedUrl ?? null,
      embedAllowed: version?.embedAllowed ?? false,
      videoWarning: version?.videoWarning ?? null,
      hasTest: Boolean(version?.testId),
      files,
      testPercent: percent,
      testStatus: (test?.status as HomeworkAssignmentStatus | undefined) ?? null,
    };
  });

  return { theories, theoryAssignments: theoryAssignmentsMapped };
}
