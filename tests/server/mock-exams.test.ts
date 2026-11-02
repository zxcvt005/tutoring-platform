import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { mockExamResults, mockExams, students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  createMockExam,
  deleteMockExam,
  setMockExamResult,
  updateMockExam,
} from "@/server/services/mock-exams-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("пробники в базе", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
  });

  afterAll(async () => {
    if (close) await close();
  });

  async function asRole(email: string) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("создаёт пробник, меняет название и дату, пишет и проверяет балл, удаляет связанные результаты", async () => {
    const anna = await asRole("anna@example.com");
    const march = await createMockExam(db, anna, {
      title: "Март",
      date: "2026-03-02",
      description: "комментарий",
    });
    const january = await createMockExam(db, anna, {
      title: "Январь",
      date: "2026-01-20",
    });

    await updateMockExam(db, anna, {
      id: march.id,
      title: "Март, вариант 2",
      date: "2026-03-20",
      description: null,
    });

    await setMockExamResult(db, anna, {
      mockExamId: january.id,
      studentId: "s1",
      testScore: 73,
    });
    await setMockExamResult(db, anna, {
      mockExamId: january.id,
      studentId: "s1",
      testScore: 82,
    });
    await setMockExamResult(db, anna, {
      mockExamId: january.id,
      studentId: "s2",
      testScore: 0,
    });
    await setMockExamResult(db, anna, {
      mockExamId: january.id,
      studentId: "s2",
      testScore: 100,
    });

    for (const value of [-1, 101, 1.5, "12.0", "abc"]) {
      await expect(
        setMockExamResult(db, anna, {
          mockExamId: january.id,
          studentId: "s1",
          testScore: value,
        })
      ).rejects.toMatchObject({ status: 400 });
    }

    const boot = await buildBootstrap(db, anna);
    expect(boot.mockExams.map((exam) => exam.id)).toEqual([
      january.id,
      march.id,
    ]);
    expect(boot.mockExams[1]).toMatchObject({
      title: "Март, вариант 2",
      date: "2026-03-20",
    });
    expect(boot.mockExams[1]?.description).toBeUndefined();
    expect(
      boot.mockExamResults.find((row) => row.studentId === "s1")?.testScore
    ).toBe(82);
    expect(
      boot.mockExamResults.find((row) => row.studentId === "s2")?.testScore
    ).toBe(100);

    const s3 = await asRole("s3@demo.local");
    const empty = await buildBootstrap(db, s3);
    expect(empty.mockExams).toEqual([]);
    expect(empty.mockExamResults).toEqual([]);

    await deleteMockExam(db, anna, march.id);
    const [keptExam] = await db
      .select()
      .from(mockExams)
      .where(eq(mockExams.id, march.id));
    expect(keptExam).toBeUndefined();
    const remaining = await db
      .select()
      .from(mockExamResults)
      .where(eq(mockExamResults.mockExamId, march.id));
    expect(remaining).toEqual([]);
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, "s1"));
    expect(student?.fullName).toBeTruthy();
    const januaryScores = await db
      .select()
      .from(mockExamResults)
      .where(eq(mockExamResults.mockExamId, january.id));
    expect(januaryScores).toHaveLength(2);
  });

  it("показывает преподавателю и ученику только свои данные", async () => {
    const anna = await asRole("anna@example.com");
    const igor = await asRole("igor@example.com");
    const s1 = await asRole("s1@demo.local");
    const s2 = await asRole("s2@demo.local");
    const s5 = await asRole("s5@demo.local");
    const press = await asRole("press@demo.local");

    const exam = await createMockExam(db, anna, {
      title: "Доступ",
      date: "2026-04-01",
    });
    await setMockExamResult(db, anna, {
      mockExamId: exam.id,
      studentId: "s1",
      testScore: 11,
    });
    await setMockExamResult(db, anna, {
      mockExamId: exam.id,
      studentId: "s2",
      testScore: 22,
    });

    await expect(
      setMockExamResult(db, anna, {
        mockExamId: exam.id,
        studentId: "s5",
        testScore: 10,
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateMockExam(db, igor, {
        id: exam.id,
        title: "Чужой",
        date: "2026-04-02",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createMockExam(db, s1, { title: "Сам", date: "2026-04-03" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setMockExamResult(db, s1, {
        mockExamId: exam.id,
        studentId: "s1",
        testScore: 40,
      })
    ).rejects.toMatchObject({ status: 403 });

    const own = await buildBootstrap(db, s1);
    expect(
      own.mockExamResults.find((row) => row.mockExamId === exam.id)?.testScore
    ).toBe(11);
    expect(own.mockExamResults.every((row) => row.studentId === "s1")).toBe(
      true
    );
    expect(own.mockExams.some((item) => item.id === exam.id)).toBe(true);

    const other = await buildBootstrap(db, s2);
    expect(
      other.mockExamResults.find((row) => row.mockExamId === exam.id)
        ?.testScore
    ).toBe(22);
    expect(other.mockExamResults.every((row) => row.studentId === "s2")).toBe(
      true
    );
    expect(other.mockExamResults.some((row) => row.testScore === 11)).toBe(
      false
    );

    const outsider = await buildBootstrap(db, s5);
    expect(outsider.mockExams).toEqual([]);
    expect(outsider.mockExamResults).toEqual([]);

    const teacher = await buildBootstrap(db, igor);
    expect(teacher.mockExams.some((item) => item.id === exam.id)).toBe(false);
    expect(teacher.mockExamResults.some((row) => row.studentId === "s1")).toBe(
      false
    );

    const pressBoot = await buildBootstrap(db, press);
    expect(pressBoot.mockExams).toEqual([]);
    expect(pressBoot.mockExamResults).toEqual([]);
  });
});
