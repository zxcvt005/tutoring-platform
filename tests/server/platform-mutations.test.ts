import { describe, it, expect, afterEach } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  assignHomework,
  completeLesson,
  publishHomework,
  upsertLesson,
  upsertTeacher,
} from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("platform mutations + bootstrap", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("director can upsert teacher; student cannot", async () => {
    const t = await createTestDb();
    close = t.close;

    const director = await asRole(t.db, "director@demo.local");
    const created = await upsertTeacher(t.db, director, {
      fullName: "Новый Преподаватель",
      subjects: ["Математика"],
      status: "active",
      email: "new-teacher@demo.local",
    });
    expect(created.id).toBeTruthy();

    const student = await asRole(t.db, "s1@demo.local");
    await expect(
      upsertTeacher(t.db, student, {
        fullName: "Hack",
        subjects: [],
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("teacher cannot complete another teacher's lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const igor = await asRole(t.db, "igor@example.com");

    await expect(
      completeLesson(t.db, igor, {
        lessonId: "l1",
        topicId: "tp1",
        attendances: [{ studentId: "s1", status: "present" }],
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("upsertLesson rejects schedule conflict for student", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");

    // Берём существующий урок s1 и пытаемся создать пересечение
    const boot = await buildBootstrap(t.db, anna);
    const existing = boot.lessons.find((l) => l.studentIds.includes("s1"));
    expect(existing).toBeTruthy();

    await expect(
      upsertLesson(t.db, anna, {
        teacherId: "t1",
        studentIds: ["s1"],
        startsAt: existing!.startsAt,
        endsAt: existing!.endsAt,
        status: "planned",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("student bootstrap never includes answer keys on open homeworks", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const data = await buildBootstrap(t.db, student);

    for (const hw of data.homeworks) {
      const json = JSON.stringify(hw.questions ?? []);
      expect(json).not.toContain("correctOptionIds");
      expect(json).not.toContain("correctAnswers");
    }

    for (const a of data.homeworkAssignments) {
      if (a.status === "reviewed") continue;
      const json = JSON.stringify(a.testSnapshot?.questions ?? []);
      expect(json).not.toContain("correctOptionIds");
      expect(json).not.toContain("correctAnswers");
    }
  });

  it("assignHomework is unique for active open assignment", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");

    await publishHomework(t.db, anna, "hw1").catch(() => undefined);

    const first = await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      studentIds: ["s2"],
    });
    expect(first.created).toBeGreaterThanOrEqual(0);

    const second = await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      studentIds: ["s2"],
    });
    expect(second.created).toBe(0);
  });
});
