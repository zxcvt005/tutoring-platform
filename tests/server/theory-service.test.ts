import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";

import { THEORY_NEED_COMPONENT_MESSAGE } from "@/lib/theory/components";
import { resolveAuthContext } from "@/server/authz/context";
import {
  testAssignments,
  theoryAssignments,
  theoryMaterialVersions,
  theoryMaterials,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  publishHomework,
  reviewHomeworkAction,
  submitHomeworkAction,
  upsertHomework,
} from "@/server/services/platform-mutations";
import { adminMarkPaymentPaid } from "@/server/services/tariffs-service";
import {
  assignTheory,
  getTheoryFileForViewer,
  markTheoryViewed,
  removeTheoryDraftFile,
  uploadTheoryFile,
  upsertTheory,
} from "@/server/services/theory-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("theory materials", () => {
  let close: (() => Promise<void>) | undefined;
  let uploadRoot: string;
  const previousUploadRoot = process.env.CHAT_UPLOAD_ROOT;
  const previousStorageDriver = process.env.CHAT_STORAGE_DRIVER;

  beforeAll(async () => {
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "theory-files-"));
    process.env.CHAT_UPLOAD_ROOT = uploadRoot;
    process.env.CHAT_STORAGE_DRIVER = "local";
  });

  afterAll(async () => {
    if (previousUploadRoot === undefined) delete process.env.CHAT_UPLOAD_ROOT;
    else process.env.CHAT_UPLOAD_ROOT = previousUploadRoot;
    if (previousStorageDriver === undefined) {
      delete process.env.CHAT_STORAGE_DRIVER;
    } else {
      process.env.CHAT_STORAGE_DRIVER = previousStorageDriver;
    }
    if (uploadRoot) await rm(uploadRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  function visible(assignment: {
    videoUrl?: string | null;
    files: { id: string }[];
    hasTest: boolean;
  }) {
    return {
      hasVideo: Boolean(assignment.videoUrl),
      notes: assignment.files.length,
      hasTest: assignment.hasTest,
    };
  }

  async function login(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  async function publishedTest(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    anna: Awaited<ReturnType<typeof login>>,
    id: string
  ) {
    await upsertHomework(db, anna, {
      id,
      teacherId: "t1",
      title: "Тест к теории",
      status: "draft",
      purpose: "theory",
      questions: [
        {
          id: "q1",
          type: "single_choice",
          prompt: "2+2",
          maxScore: 1,
          options: [
            { id: "oa", text: "4" },
            { id: "ob", text: "5" },
          ],
          correctOptionIds: ["oa"],
        },
        {
          id: "q2",
          type: "essay",
          prompt: "Объясните",
          maxScore: 1,
        },
      ],
    });
    await publishHomework(db, anna, id);
  }

  it("creates theory without a test and completes after view mark", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Без теста",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const assigned = await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1"],
    });
    expect(assigned.created).toBe(1);
    const again = await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1"],
    });
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(1);

    const s1 = await login(t.db, "s1@demo.local");
    const [row] = await t.db.select().from(theoryAssignments);
    const viewed = await markTheoryViewed(t.db, s1, row.id);
    expect(viewed.status).toBe("completed");
    const viewedAgain = await markTheoryViewed(t.db, s1, row.id);
    expect(viewedAgain.alreadyViewed).toBe(true);
    const rows = await t.db.select().from(theoryAssignments);
    expect(rows).toHaveLength(1);
  });

  it("keeps theory unfinished until the attached test is done and shows in grades", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await publishedTest(t.db, anna, "hw_theory_1");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Электрическое поле",
      videoUrl: "https://vk.com/video-1_2",
      testId: "hw_theory_1",
      publish: true,
    });
    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1", "s2"],
    });
    const s1 = await login(t.db, "s1@demo.local");
    const [assignment] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.studentId, "s1"));
    const afterView = await markTheoryViewed(t.db, s1, assignment.id);
    expect(afterView.status).toBe("viewed");
    expect(afterView.testAssignmentId).toBeTruthy();

    const boot = await buildBootstrap(t.db, s1);
    expect(boot.theoryAssignments.some((a) => a.id === assignment.id)).toBe(
      true
    );
    expect(
      boot.homeworkAssignments.some(
        (a) => a.id === afterView.testAssignmentId && a.sourceKind === "theory"
      )
    ).toBe(true);

    await submitHomeworkAction(t.db, s1, afterView.testAssignmentId!, [
      { questionId: "q1", selectedOptionIds: ["oa"] },
      { questionId: "q2", textAnswer: "поле" },
    ]);
    const [waiting] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.id, assignment.id));
    expect(waiting.status).toBe("awaiting_review");

    await reviewHomeworkAction(
      t.db,
      anna,
      afterView.testAssignmentId!,
      [{ questionId: "q2", manualScore: 1 }]
    );
    const [done] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.id, assignment.id));
    expect(done.status).toBe("completed");

    const teacherBoot = await buildBootstrap(t.db, anna);
    const theoryGrade = teacherBoot.homeworkAssignments.find(
      (a) => a.sourceKind === "theory" && a.studentId === "s1"
    );
    const hwGrade = teacherBoot.homeworkAssignments.find(
      (a) => a.sourceKind !== "theory" && a.studentId === "s1"
    );
    expect(theoryGrade?.theoryTitle).toBe("Электрическое поле");
    expect(theoryGrade?.status).toBe("reviewed");
    if (hwGrade) expect(hwGrade.sourceKind).not.toBe("theory");
  });

  it("rejects outsider assignment, client score spoof, and foreign access", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await publishedTest(t.db, anna, "hw_theory_sec");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Секрет",
      videoUrl: "https://vk.com/video-1_2",
      testId: "hw_theory_sec",
      publish: true,
    });
    await expect(
      assignTheory(t.db, anna, {
        materialId: created.id,
        studentIds: ["s5"],
      })
    ).rejects.toMatchObject({ status: 403 });

    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1"],
    });
    const s1 = await login(t.db, "s1@demo.local");
    const s5 = await login(t.db, "s5@demo.local");
    const [assignment] = await t.db.select().from(theoryAssignments);
    await expect(markTheoryViewed(t.db, s5, assignment.id)).rejects.toMatchObject(
      { status: 403 }
    );

    const viewed = await markTheoryViewed(t.db, s1, assignment.id);
    await submitHomeworkAction(t.db, s1, viewed.testAssignmentId!, [
      {
        questionId: "q1",
        selectedOptionIds: ["ob"],
        autoScore: 100,
        isCorrect: true,
      },
      { questionId: "q2", textAnswer: "x" },
    ]);
    const [testRow] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.id, viewed.testAssignmentId!));
    expect(Number(testRow.attempt1Percent)).toBe(0);

    const s5Boot = await buildBootstrap(t.db, s5);
    expect(s5Boot.theoryAssignments).toHaveLength(0);

    const igor = await login(t.db, "igor@example.com");
    await expect(
      upsertTheory(t.db, igor, {
        id: created.id,
        teacherId: "t2",
        title: "Чужое",
        videoUrl: "https://vk.com/video-1_2",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("preserves assignment history when the published theory is edited", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Версия 1",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1"],
    });
    const [before] = await t.db.select().from(theoryAssignments);
    await upsertTheory(t.db, anna, {
      id: created.id,
      teacherId: "t1",
      title: "Версия 2",
      videoUrl: "https://vk.com/video-9_9",
      publish: true,
    });
    const [after] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.id, before.id));
    expect(after.versionId).toBe(before.versionId);
    const versions = await t.db.select().from(theoryMaterialVersions);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const [material] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, created.id));
    expect(material.currentVersionId).not.toBe(before.versionId);
    expect(material.title).toBe("Версия 2");
  });

  it("publishes all seven component combinations and rejects an empty theory", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await publishedTest(t.db, anna, "hw_theory_combo");
    const pdf = {
      bytes: Buffer.from("%PDF-1.4 notes"),
      filename: "notes.pdf",
    };

    const emptyDraft = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Пустая",
    });
    expect(emptyDraft.id).toBeTruthy();
    await expect(
      upsertTheory(t.db, anna, {
        teacherId: "t1",
        title: "Пустая",
        publish: true,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: THEORY_NEED_COMPONENT_MESSAGE,
    });
    await expect(
      upsertTheory(t.db, anna, {
        id: emptyDraft.id,
        teacherId: "t1",
        title: "Пустая",
        publish: true,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: THEORY_NEED_COMPONENT_MESSAGE,
    });

    const videoOnly = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Только ролик",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const notesDraft = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Только конспект",
    });
    await uploadTheoryFile(t.db, anna, notesDraft.id, pdf);
    const notesOnly = await upsertTheory(t.db, anna, {
      id: notesDraft.id,
      teacherId: "t1",
      title: "Только конспект",
      publish: true,
    });
    const testOnly = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Только тест",
      testId: "hw_theory_combo",
      publish: true,
    });
    const videoNotesDraft = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Ролик и конспект",
      videoUrl: "https://vk.com/video-1_2",
    });
    await uploadTheoryFile(t.db, anna, videoNotesDraft.id, pdf);
    const videoNotes = await upsertTheory(t.db, anna, {
      id: videoNotesDraft.id,
      teacherId: "t1",
      title: "Ролик и конспект",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const videoTest = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Ролик и тест",
      videoUrl: "https://vk.com/video-1_2",
      testId: "hw_theory_combo",
      publish: true,
    });
    const notesTestDraft = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Конспект и тест",
      testId: "hw_theory_combo",
    });
    await uploadTheoryFile(t.db, anna, notesTestDraft.id, pdf);
    const notesTest = await upsertTheory(t.db, anna, {
      id: notesTestDraft.id,
      teacherId: "t1",
      title: "Конспект и тест",
      testId: "hw_theory_combo",
      publish: true,
    });
    const allDraft = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Все три",
      videoUrl: "https://vk.com/video-1_2",
      testId: "hw_theory_combo",
    });
    await uploadTheoryFile(t.db, anna, allDraft.id, pdf);
    const allThree = await upsertTheory(t.db, anna, {
      id: allDraft.id,
      teacherId: "t1",
      title: "Все три",
      videoUrl: "https://vk.com/video-1_2",
      testId: "hw_theory_combo",
      publish: true,
    });

    const ids = [
      videoOnly.id,
      notesOnly.id,
      testOnly.id,
      videoNotes.id,
      videoTest.id,
      notesTest.id,
      allThree.id,
    ];
    for (const id of ids) {
      const assigned = await assignTheory(t.db, anna, {
        materialId: id,
        studentIds: ["s1"],
      });
      expect(assigned.created).toBe(1);
    }

    const materials = await t.db.select().from(theoryMaterials);
    const notesRow = materials.find((m) => m.id === notesOnly.id);
    const testRow = materials.find((m) => m.id === testOnly.id);
    expect(notesRow?.videoUrl).toBeNull();
    expect(testRow?.videoUrl).toBeNull();
    expect(testRow?.testId).toBe("hw_theory_combo");

    const s1 = await login(t.db, "s1@demo.local");
    const boot = await buildBootstrap(t.db, s1);
    const byTitle = Object.fromEntries(
      boot.theoryAssignments.map((a) => [a.title, a])
    );
    expect(visible(byTitle["Только ролик"])).toEqual({
      hasVideo: true,
      notes: 0,
      hasTest: false,
    });
    expect(visible(byTitle["Только конспект"])).toEqual({
      hasVideo: false,
      notes: 1,
      hasTest: false,
    });
    expect(visible(byTitle["Только тест"])).toEqual({
      hasVideo: false,
      notes: 0,
      hasTest: true,
    });
    expect(visible(byTitle["Ролик и конспект"])).toEqual({
      hasVideo: true,
      notes: 1,
      hasTest: false,
    });
    expect(visible(byTitle["Ролик и тест"])).toEqual({
      hasVideo: true,
      notes: 0,
      hasTest: true,
    });
    expect(visible(byTitle["Конспект и тест"])).toEqual({
      hasVideo: false,
      notes: 1,
      hasTest: true,
    });
    expect(visible(byTitle["Все три"])).toEqual({
      hasVideo: true,
      notes: 1,
      hasTest: true,
    });
    expect(boot.homeworkAssignments.some((a) => a.sourceKind === "theory")).toBe(
      false
    );

    const notesFile = byTitle["Только конспект"].files[0];
    const downloaded = await getTheoryFileForViewer(t.db, s1, notesFile.id);
    expect(downloaded.originalName).toBe("notes.pdf");
    expect(downloaded.mimeType).toBe("application/pdf");
  });

  it("lets a notes-only theory complete without a test and keeps results after adding a test", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Конспект",
    });
    await uploadTheoryFile(t.db, anna, created.id, {
      bytes: Buffer.from("%PDF-1.4 notes"),
      filename: "notes.pdf",
    });
    await upsertTheory(t.db, anna, {
      id: created.id,
      teacherId: "t1",
      title: "Конспект",
      publish: true,
    });
    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1"],
    });
    const s1 = await login(t.db, "s1@demo.local");
    const [row] = await t.db.select().from(theoryAssignments);
    const viewed = await markTheoryViewed(t.db, s1, row.id);
    expect(viewed.status).toBe("completed");
    expect(viewed.testAssignmentId).toBeNull();

    await publishedTest(t.db, anna, "hw_theory_added");
    await upsertTheory(t.db, anna, {
      id: created.id,
      teacherId: "t1",
      title: "Конспект и тест",
      testId: "hw_theory_added",
      publish: true,
    });
    const [afterEdit] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.id, row.id));
    expect(afterEdit.status).toBe("completed");
    expect(afterEdit.versionId).toBe(row.versionId);

    const testOnly = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Сразу тест",
      testId: "hw_theory_added",
      publish: true,
    });
    await assignTheory(t.db, anna, {
      materialId: testOnly.id,
      studentIds: ["s1"],
    });
    const [testAssignment] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.materialId, testOnly.id));
    const afterOpen = await markTheoryViewed(t.db, s1, testAssignment.id);
    expect(afterOpen.status).toBe("viewed");
    expect(afterOpen.testAssignmentId).toBeTruthy();
    await submitHomeworkAction(t.db, s1, afterOpen.testAssignmentId!, [
      { questionId: "q1", selectedOptionIds: ["oa"] },
      { questionId: "q2", textAnswer: "поле" },
    ]);
    await reviewHomeworkAction(t.db, anna, afterOpen.testAssignmentId!, [
      { questionId: "q2", manualScore: 1 },
    ]);
    const [testDone] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.id, testAssignment.id));
    expect(testDone.status).toBe("completed");
    const studentBoot = await buildBootstrap(t.db, s1);
    expect(
      studentBoot.homeworkAssignments.some(
        (a) => a.id === afterOpen.testAssignmentId && a.sourceKind === "theory"
      )
    ).toBe(true);
    expect(
      studentBoot.theoryAssignments.find((a) => a.id === testAssignment.id)
        ?.testPercent
    ).toBe(100);
  });

  it("adds and removes components without rewriting assigned results", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await publishedTest(t.db, anna, "hw_theory_edit");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Сначала ролик",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s1"],
    });
    const [first] = await t.db.select().from(theoryAssignments);
    const s1 = await login(t.db, "s1@demo.local");
    const completed = await markTheoryViewed(t.db, s1, first.id);
    expect(completed.status).toBe("completed");
    expect(completed.testAssignmentId).toBeNull();

    await upsertTheory(t.db, anna, {
      id: created.id,
      teacherId: "t1",
      title: "Ролик и тест",
      videoUrl: "https://vk.com/video-1_2",
      testId: "hw_theory_edit",
      publish: true,
    });
    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s2"],
    });
    const [s1AfterAdd] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.id, first.id));
    expect(s1AfterAdd.versionId).toBe(first.versionId);
    expect(s1AfterAdd.status).toBe("completed");
    expect(s1AfterAdd.testAssignmentId).toBeNull();

    const director = await login(t.db, "director@demo.local");
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: "pay_s2",
      reason: "оплата тарифа для проверки теории",
    });
    const s2 = await login(t.db, "s2@demo.local");
    const s2Boot = await buildBootstrap(t.db, s2);
    const s2Item = s2Boot.theoryAssignments.find(
      (a) => a.materialId === created.id
    );
    expect(s2Item).toBeTruthy();
    expect(visible(s2Item!)).toEqual({
      hasVideo: true,
      notes: 0,
      hasTest: true,
    });
    const s2Viewed = await markTheoryViewed(t.db, s2, s2Item!.id);
    expect(s2Viewed.status).toBe("viewed");
    await submitHomeworkAction(t.db, s2, s2Viewed.testAssignmentId!, [
      { questionId: "q1", selectedOptionIds: ["oa"] },
      { questionId: "q2", textAnswer: "поле" },
    ]);
    await reviewHomeworkAction(t.db, anna, s2Viewed.testAssignmentId!, [
      { questionId: "q2", manualScore: 1 },
    ]);

    const uploaded = await uploadTheoryFile(t.db, anna, created.id, {
      bytes: Buffer.from("%PDF-1.4 notes"),
      filename: "notes.pdf",
    });
    await upsertTheory(t.db, anna, {
      id: created.id,
      teacherId: "t1",
      title: "Только конспект",
      testId: null,
      publish: true,
    });
    const [s2AfterRemove] = await t.db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.studentId, "s2"));
    expect(s2AfterRemove.testAssignmentId).toBe(s2Viewed.testAssignmentId);
    expect(s2AfterRemove.status).toBe("completed");
    const s2Later = await buildBootstrap(t.db, s2);
    const s2Frozen = s2Later.theoryAssignments.find(
      (a) => a.materialId === created.id
    );
    expect(s2Frozen?.testPercent).toBe(100);
    expect(visible(s2Frozen!)).toEqual({
      hasVideo: true,
      notes: 0,
      hasTest: true,
    });

    await assignTheory(t.db, anna, {
      materialId: created.id,
      studentIds: ["s3"],
    });
    const s3 = await login(t.db, "s3@demo.local");
    const s3Boot = await buildBootstrap(t.db, s3);
    const s3Item = s3Boot.theoryAssignments.find(
      (a) => a.materialId === created.id
    );
    expect(visible(s3Item!)).toEqual({
      hasVideo: false,
      notes: 1,
      hasTest: false,
    });

    await removeTheoryDraftFile(t.db, anna, created.id, uploaded.id);
    await expect(
      upsertTheory(t.db, anna, {
        id: created.id,
        teacherId: "t1",
        title: "Пустая после удаления",
        publish: true,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: THEORY_NEED_COMPONENT_MESSAGE,
    });
    const [material] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, created.id));
    expect(material.title).toBe("Только конспект");
    const versions = await t.db.select().from(theoryMaterialVersions);
    expect(versions.length).toBeGreaterThanOrEqual(3);
  });
});
