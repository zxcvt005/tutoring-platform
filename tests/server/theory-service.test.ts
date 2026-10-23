import { describe, it, expect, afterEach } from "vitest";

import { eq } from "drizzle-orm";

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
import {
  assignTheory,
  markTheoryViewed,
  upsertTheory,
} from "@/server/services/theory-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("theory materials", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

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
});
