import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { upsertStudent } from "@/server/services/platform-mutations";
import {
  getStudentAvailabilityForViewer,
  updateStudentAvailabilityByStaff,
} from "@/server/services/student-onboarding-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("pressa student management parity", () => {
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

  it("lets press edit questionnaire fields and teacher like director", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");

    const created = await upsertStudent(t.db, director, {
      fullName: "Ученик Для Прессы",
      grade: "8",
      telegram: "@old",
      phone: "+7000",
      parentName: "Родитель Старый",
      parentContacts: "старый контакт",
      learningGoal: "цель 1",
      notes: "заметка 1",
      status: "active",
      teacherId: "",
    });

    const updated = await upsertStudent(t.db, press, {
      id: created.id,
      fullName: "Ученик Для Прессы Обновлён",
      grade: "10",
      telegram: "@new_tg",
      phone: "+79991112233",
      parentName: "Родитель Новый",
      parentContacts: "tg родителя",
      learningGoal: "ЕГЭ физика",
      notes: "доп. инфо",
      status: "active",
      teacherId: "t1",
    });
    expect(updated.id).toBe(created.id);

    const [row] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(row?.fullName).toBe("Ученик Для Прессы Обновлён");
    expect(row?.grade).toBe("10");
    expect(row?.telegram).toBe("@new_tg");
    expect(row?.phone).toBe("+79991112233");
    expect(row?.parentName).toBe("Родитель Новый");
    expect(row?.parentContacts).toBe("tg родителя");
    expect(row?.learningGoal).toBe("ЕГЭ физика");
    expect(row?.notes).toBe("доп. инфо");
    expect(row?.primaryTeacherId).toBe("t1");

    const unassigned = await upsertStudent(t.db, press, {
      id: created.id,
      fullName: "Ученик Для Прессы Обновлён",
      grade: "10",
      telegram: "@new_tg",
      phone: "+79991112233",
      parentName: "Родитель Новый",
      parentContacts: "tg родителя",
      learningGoal: "ЕГЭ физика",
      notes: "доп. инфо",
      status: "active",
      teacherId: "",
    });
    expect(unassigned.id).toBe(created.id);
    const [after] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(after?.primaryTeacherId).toBeNull();

    const bootstrapDirector = await buildBootstrap(t.db, director);
    const inDirector = bootstrapDirector.students.find(
      (s) => s.id === created.id
    );
    expect(inDirector?.fullName).toBe("Ученик Для Прессы Обновлён");
    expect(inDirector?.parentName).toBe("Родитель Новый");
    expect(inDirector?.learningGoal).toBe("ЕГЭ физика");
    expect(inDirector?.notes).toBe("доп. инфо");
  });

  it("lets press view and edit availability; keeps archive director-only", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");

    const created = await upsertStudent(t.db, director, {
      fullName: "Доступность Пресса",
      status: "active",
      teacherId: "t1",
    });

    const view = await getStudentAvailabilityForViewer(
      t.db,
      press,
      created.id
    );
    expect(view.studentId).toBe(created.id);
    expect(view.profile.fullName).toBe("Доступность Пресса");

    const saved = await updateStudentAvailabilityByStaff(
      t.db,
      press,
      created.id,
      [{ weekday: 1, hourStart: 10 }]
    );
    expect(saved.availabilitySlots).toEqual([{ weekday: 1, hourStart: 10 }]);

    const bootstrapPress = await buildBootstrap(t.db, press);
    const pressStudent = bootstrapPress.students.find(
      (s) => s.id === created.id
    );
    expect(pressStudent?.parentName).toBeDefined();
    expect(pressStudent?.learningGoal).toBeDefined();

    const { archiveStudent } = await import(
      "@/server/services/platform-mutations"
    );
    await expect(
      archiveStudent(t.db, press, {
        id: created.id,
        reason: "stopped",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
