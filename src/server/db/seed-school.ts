/**
 * Демонстрационный набор «Школа Неодин» для локального QA.
 * Отдельная организация — не затирает org_demo.
 */
import { eq, inArray, or } from "drizzle-orm";

import {
  addAppDateKey,
  appDateKey,
  fromAppDateTime,
} from "@/lib/app-time";

import { hashPassword } from "@/server/auth/password";
import { seedSchoolCatalogAndHistory } from "@/server/db/school-history-seed";
import * as t from "@/server/db/schema";
import {
  backfillLedgerFromAttendances,
  DEMO_PASSWORD,
} from "@/server/db/seed";
import { deepWin1251Safe } from "@/server/db/unicode-safe";

export const SCHOOL_ORG_ID = "org_school_qa";
export const SCHOOL_ORG_SLUG = "umba-school-qa";
export const SCHOOL_PASSWORD = DEMO_PASSWORD;

export const SCHOOL_SEED_EXPECTED = {
  directors: 1,
  teachers: 3,
  students: 20,
  unassignedStudents: 3,
  schedules: 17,
  pastLessonsMin: 80,
  futureLessonsMin: 15,
  tariffs: 3,
  assignments: 18,
  payments: 18,
  tests: 15,
  homeworkMin: 12,
  topicsMin: 24,
} as const;

type DbLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (...args: any[]) => any;
};

const PHYSICS_TOPICS = [
  "Кинематика: равноускоренное движение",
  "Законы Ньютона и силы",
  "Работа, мощность, энергия",
  "Импульс и законы сохранения",
  "Механические колебания",
  "Волны и звук",
  "Молекулярная физика и МКТ",
  "Термодинамика: первое начало",
  "Электростатика: поле и потенциал",
  "Постоянный ток и законы Ома",
  "Магнитное поле и сила Ампера",
  "Электромагнитная индукция",
  "Колебательный контур",
  "Геометрическая оптика: линзы",
  "Волновая оптика: интерференция",
  "Квантовая физика: фотоэффект",
  "Атомная и ядерная физика",
  "Разбор типовых задач ЕГЭ №1–4",
  "Разбор типовых задач ЕГЭ №5–12",
  "Тренировочный вариант ЕГЭ (физика)",
];

type TeacherSpec = {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  bio: string;
  specializations: string[];
  phone: string;
  workDays: number[];
};

type StudentSpec = {
  id: string;
  fullName: string;
  email: string;
  grade: string;
  teacherId: string | null;
  notes: string;
};

type ScheduleSpec = {
  id: string;
  teacherId: string;
  studentIds: string[];
  weekdays: number[];
  startTime: string;
  durationMin: number;
  subject: string;
};

function atOffset(days: number, hour: number, minute = 0): Date {
  const key = addAppDateKey(appDateKey(new Date()), days);
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return fromAppDateTime(key, hm);
}

function daysAgo(n: number): Date {
  return atOffset(-n, 12, 0);
}

export function schoolTeachers(): TeacherSpec[] {
  return [
    {
      id: "sch_t1",
      fullName: "Елена Викторовна Морозова",
      email: "morozova@umba-school.test",
      initials: "ЕМ",
      bio: "Готовлю к ЕГЭ по физике 14 лет. Системный разбор теории и задач второй части.",
      specializations: ["ЕГЭ физика", "11 класс", "механика"],
      phone: "+7 900 200-11-01",
      workDays: [1, 2, 3, 4, 5],
    },
    {
      id: "sch_t2",
      fullName: "Артём Игоревич Соколов",
      email: "sokolov@umba-school.test",
      initials: "АС",
      bio: "Упор на электродинамику и оптику. Много практики с графиками и экспериментальными заданиями.",
      specializations: ["ЕГЭ физика", "электродинамика"],
      phone: "+7 900 200-11-02",
      workDays: [1, 2, 3, 4, 5],
    },
    {
      id: "sch_t3",
      fullName: "Наталья Павловна Крылова",
      email: "krylova@umba-school.test",
      initials: "НК",
      bio: "Работаю с 10–11 классами: от базы до уверенного порога 70+ баллов.",
      specializations: ["ЕГЭ физика", "10 класс", "термодинамика"],
      phone: "+7 900 200-11-03",
      workDays: [2, 3, 4, 5, 6],
    },
  ];
}

/** Ровно 20 учеников: 8 + 6 + 3 + 3 без преподавателя */
export function schoolStudents(): StudentSpec[] {
  const named: Omit<StudentSpec, "id" | "email">[] = [
    { fullName: "Дмитрий Алексеев", grade: "11", teacherId: "sch_t1", notes: "Цель: 80+ на ЕГЭ" },
    { fullName: "София Белова", grade: "11", teacherId: "sch_t1", notes: "Слабая кинематика" },
    { fullName: "Максим Волков", grade: "11", teacherId: "sch_t1", notes: "Сильный по механике" },
    { fullName: "Анна Григорьева", grade: "10", teacherId: "sch_t1", notes: "Переход с базы" },
    { fullName: "Илья Ершов", grade: "11", teacherId: "sch_t1", notes: "Нужна дисциплина ДЗ" },
    { fullName: "Полина Жукова", grade: "11", teacherId: "sch_t1", notes: "Готовится с сентября" },
    { fullName: "Кирилл Зайцев", grade: "10", teacherId: "sch_t1", notes: "Олимпиадный интерес" },
    { fullName: "Мария Кузнецова", grade: "11", teacherId: "sch_t1", notes: "Повторение МКТ" },
    { fullName: "Никита Лебедев", grade: "11", teacherId: "sch_t2", notes: "Электричество — приоритет" },
    { fullName: "Ева Новикова", grade: "11", teacherId: "sch_t2", notes: "Боится второй части" },
    { fullName: "Роман Орлов", grade: "10", teacherId: "sch_t2", notes: "Хорошая математика" },
    { fullName: "Алина Павлова", grade: "11", teacherId: "sch_t2", notes: "Занятия вечером" },
    { fullName: "Тимур Романов", grade: "11", teacherId: "sch_t2", notes: "Повтор прошлых ошибок" },
    { fullName: "Вера Смирнова", grade: "10", teacherId: "sch_t2", notes: "Начинает с нуля по оптике" },
    { fullName: "Олег Тимофеев", grade: "11", teacherId: "sch_t3", notes: "Целевой вуз — МИФИ" },
    { fullName: "Юлия Устинова", grade: "11", teacherId: "sch_t3", notes: "Нужен стабильный 70" },
    { fullName: "Глеб Фёдоров", grade: "10", teacherId: "sch_t3", notes: "Параллельно школа+" },
    { fullName: "Ксения Харламова", grade: "11", teacherId: null, notes: "Ожидает назначения преподавателя" },
    { fullName: "Павел Чернов", grade: "10", teacherId: null, notes: "Заявка на вводный урок" },
    { fullName: "Дарья Яковлева", grade: "11", teacherId: null, notes: "Перевод из другой школы" },
  ];
  return named.map((s, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      id: `sch_s${n}`,
      email: `student${n}@umba-school.test`,
      ...s,
    };
  });
}

/**
 * Регулярные слоты без конфликтов внутри преподавателя и ученика.
 * Несколько параллельных занятий у разных преподавателей в одно время.
 */
export function schoolSchedules(): ScheduleSpec[] {
  return [
    // t1 — 8 учеников, пары 2×/нед
    { id: "sch_sch_01", teacherId: "sch_t1", studentIds: ["sch_s01"], weekdays: [2, 4], startTime: "17:00", durationMin: 60, subject: PHYSICS_TOPICS[0] },
    { id: "sch_sch_02", teacherId: "sch_t1", studentIds: ["sch_s02"], weekdays: [2, 4], startTime: "18:10", durationMin: 60, subject: PHYSICS_TOPICS[1] },
    { id: "sch_sch_03", teacherId: "sch_t1", studentIds: ["sch_s03"], weekdays: [1, 3], startTime: "16:00", durationMin: 60, subject: PHYSICS_TOPICS[2] },
    { id: "sch_sch_04", teacherId: "sch_t1", studentIds: ["sch_s04"], weekdays: [1, 3], startTime: "17:10", durationMin: 60, subject: PHYSICS_TOPICS[3] },
    { id: "sch_sch_05", teacherId: "sch_t1", studentIds: ["sch_s05"], weekdays: [5], startTime: "15:00", durationMin: 90, subject: PHYSICS_TOPICS[4] },
    { id: "sch_sch_06", teacherId: "sch_t1", studentIds: ["sch_s06"], weekdays: [5], startTime: "16:40", durationMin: 60, subject: PHYSICS_TOPICS[5] },
    { id: "sch_sch_07", teacherId: "sch_t1", studentIds: ["sch_s07"], weekdays: [6], startTime: "11:00", durationMin: 60, subject: PHYSICS_TOPICS[6] },
    { id: "sch_sch_08", teacherId: "sch_t1", studentIds: ["sch_s08"], weekdays: [6], startTime: "12:10", durationMin: 60, subject: PHYSICS_TOPICS[7] },
    // t2 — параллельно с t1 в 17:00 вт/чт
    { id: "sch_sch_09", teacherId: "sch_t2", studentIds: ["sch_s09"], weekdays: [2, 4], startTime: "17:00", durationMin: 60, subject: PHYSICS_TOPICS[8] },
    { id: "sch_sch_10", teacherId: "sch_t2", studentIds: ["sch_s10"], weekdays: [2, 4], startTime: "18:10", durationMin: 60, subject: PHYSICS_TOPICS[9] },
    { id: "sch_sch_11", teacherId: "sch_t2", studentIds: ["sch_s11"], weekdays: [1, 3], startTime: "15:00", durationMin: 60, subject: PHYSICS_TOPICS[10] },
    { id: "sch_sch_12", teacherId: "sch_t2", studentIds: ["sch_s12"], weekdays: [1, 3], startTime: "19:00", durationMin: 60, subject: PHYSICS_TOPICS[11] },
    { id: "sch_sch_13", teacherId: "sch_t2", studentIds: ["sch_s13"], weekdays: [5], startTime: "17:00", durationMin: 60, subject: PHYSICS_TOPICS[12] },
    { id: "sch_sch_14", teacherId: "sch_t2", studentIds: ["sch_s14"], weekdays: [6], startTime: "14:00", durationMin: 60, subject: PHYSICS_TOPICS[13] },
    // t3
    { id: "sch_sch_15", teacherId: "sch_t3", studentIds: ["sch_s15"], weekdays: [2, 4], startTime: "17:00", durationMin: 60, subject: PHYSICS_TOPICS[14] },
    { id: "sch_sch_16", teacherId: "sch_t3", studentIds: ["sch_s16"], weekdays: [3, 5], startTime: "18:00", durationMin: 60, subject: PHYSICS_TOPICS[15] },
    { id: "sch_sch_17", teacherId: "sch_t3", studentIds: ["sch_s17"], weekdays: [6], startTime: "10:00", durationMin: 90, subject: PHYSICS_TOPICS[16] },
  ];
}

export type SchoolSeedStats = {
  directors: number;
  teachers: number;
  students: number;
  unassignedStudents: number;
  schedules: number;
  futureLessons: number;
  pastLessons: number;
  tariffs: number;
  assignments: number;
  payments: number;
  tests: number;
  questions: number;
  topics: number;
  homeworkAssignments: number;
};

/**
 * Идемпотентно пересоздаёт только SCHOOL_ORG_ID.
 * Не трогает org_demo и другие организации.
 */
export type SchoolSeedOptions = {
  /** Windows embedded PG часто WIN1251 — нормализуем спецсимволы в темах */
  win1251Safe?: boolean;
};

export async function seedSchoolOrganization(
  db: DbLike,
  now: Date = new Date(),
  options: SchoolSeedOptions = {}
): Promise<SchoolSeedStats> {
  const teachers = options.win1251Safe
    ? deepWin1251Safe(schoolTeachers())
    : schoolTeachers();
  const students = options.win1251Safe
    ? deepWin1251Safe(schoolStudents())
    : schoolStudents();
  const schedules = options.win1251Safe
    ? deepWin1251Safe(schoolSchedules())
    : schoolSchedules();
  const passwordHash = await hashPassword(SCHOOL_PASSWORD);

  await db
    .delete(t.auditLog)
    .where(
      or(
        eq(t.auditLog.organizationId, SCHOOL_ORG_ID),
        eq(t.auditLog.entityId, SCHOOL_ORG_ID)
      )
    );

  const [existingOrg] = await db
    .select({ id: t.organizations.id })
    .from(t.organizations)
    .where(eq(t.organizations.id, SCHOOL_ORG_ID))
    .limit(1);
  if (existingOrg) {
    await db
      .update(t.organizations)
      .set({ name: "Неодин — QA школа", slug: SCHOOL_ORG_SLUG })
      .where(eq(t.organizations.id, SCHOOL_ORG_ID));
  } else {
    await db.insert(t.organizations).values({
      id: SCHOOL_ORG_ID,
      name: "Неодин — QA школа",
      slug: SCHOOL_ORG_SLUG,
    });
  }

  await wipeSchoolOperationalData(db);

  await upsertSchoolUser(db, {
    id: "user_sch_director",
    email: "director@umba-school.test",
    passwordHash,
    fullName: "Ольга Директоровна Умбина",
    status: "active",
  });
  await upsertById(db, t.memberships, {
    id: "mem_sch_director",
    organizationId: SCHOOL_ORG_ID,
    userId: "user_sch_director",
    role: "director",
  });

  for (const teacher of teachers) {
    const uid = `user_${teacher.id}`;
    await upsertSchoolUser(db, {
      id: uid,
      email: teacher.email,
      passwordHash,
      fullName: teacher.fullName,
      phone: teacher.phone,
      status: "active",
    });
    await upsertById(db, t.memberships, {
      id: `mem_${teacher.id}`,
      organizationId: SCHOOL_ORG_ID,
      userId: uid,
      role: "teacher",
    });
    await upsertById(db, t.teachers, {
      id: teacher.id,
      organizationId: SCHOOL_ORG_ID,
      userId: uid,
      fullName: teacher.fullName,
      avatarInitials: teacher.initials,
      bio: teacher.bio,
      photoKey: null,
      subjects: ["Физика"],
      specializations: teacher.specializations,
      phone: teacher.phone,
      email: teacher.email,
      startedAt: daysAgo(300),
      status: "active",
      lessonPrice: "2800",
      teacherPay: "1700",
      defaultDurationMin: 60,
      workDays: teacher.workDays,
      workIntervals: [{ start: "10:00", end: "21:00" }],
    });
  }

  for (const student of students) {
    const uid = `user_${student.id}`;
    await upsertSchoolUser(db, {
      id: uid,
      email: student.email,
      passwordHash,
      fullName: student.fullName,
      status: "active",
    });
    await upsertById(db, t.memberships, {
      id: `mem_${student.id}`,
      organizationId: SCHOOL_ORG_ID,
      userId: uid,
      role: "student",
    });
    await upsertById(db, t.students, {
      id: student.id,
      organizationId: SCHOOL_ORG_ID,
      userId: uid,
      primaryTeacherId: student.teacherId,
      fullName: student.fullName,
      contacts: student.email,
      status: "active",
      notes: `${student.grade} класс. ${student.notes}`,
    });
  }

  const tariffs = [
    {
      id: "sch_tariff_basic",
      name: "Базовый (8 занятий)",
      price: "16000",
      durationDays: 30,
      lessonsLimit: 8,
      weeklyFrequency: 2,
      includesText: "Индивидуальные занятия, ДЗ",
      features: ["individual_lessons", "homework"],
    },
    {
      id: "sch_tariff_standard",
      name: "Стандарт (12 занятий)",
      price: "22000",
      durationDays: 30,
      lessonsLimit: 12,
      weeklyFrequency: 2,
      includesText: "Занятия, ДЗ, пробники",
      features: ["individual_lessons", "homework", "mock_exams"],
    },
    {
      id: "sch_tariff_intensive",
      name: "Интенсив ЕГЭ",
      price: "32000",
      durationDays: 45,
      lessonsLimit: 16,
      weeklyFrequency: 3,
      includesText: "Интенсив + разбор вариантов",
      features: ["individual_lessons", "homework", "mock_exams", "office_hours"],
    },
  ];
  for (const tariff of tariffs) {
    await db.insert(t.tariffs).values({
      ...tariff,
      organizationId: SCHOOL_ORG_ID,
      currency: "RUB",
      status: "active",
    });
  }

  const historyFrom = atOffset(-75, 0);
  const historyUntil = atOffset(40, 23);

  type TariffAssignSpec = {
    id: string;
    studentId: string;
    tariffId: string;
    startsAt: Date;
    endsAt: Date;
    price: string;
    status: "active" | "pending_payment" | "expired" | "cancelled";
    paymentStatus: "paid" | "unpaid" | "refunded";
    lessonsLimit: number;
  };

  const assignments: TariffAssignSpec[] = [
    {
      id: "sch_sta_01",
      studentId: "sch_s01",
      tariffId: "sch_tariff_standard",
      startsAt: historyFrom,
      endsAt: historyUntil,
      price: "22000",
      status: "active",
      paymentStatus: "paid",
      lessonsLimit: 48,
    },
    {
      id: "sch_sta_02",
      studentId: "sch_s02",
      tariffId: "sch_tariff_basic",
      startsAt: atOffset(-5, 0),
      endsAt: atOffset(25, 23),
      price: "16000",
      status: "pending_payment",
      paymentStatus: "unpaid",
      lessonsLimit: 8,
    },
    {
      id: "sch_sta_03",
      studentId: "sch_s09",
      tariffId: "sch_tariff_intensive",
      startsAt: atOffset(-50, 0),
      endsAt: atOffset(-5, 23),
      price: "32000",
      status: "expired",
      paymentStatus: "paid",
      lessonsLimit: 16,
    },
    {
      id: "sch_sta_04",
      studentId: "sch_s10",
      tariffId: "sch_tariff_standard",
      startsAt: historyFrom,
      endsAt: historyUntil,
      price: "22000",
      status: "active",
      paymentStatus: "paid",
      lessonsLimit: 48,
    },
    {
      id: "sch_sta_05",
      studentId: "sch_s15",
      tariffId: "sch_tariff_basic",
      startsAt: atOffset(-3, 0),
      endsAt: atOffset(27, 23),
      price: "16000",
      status: "pending_payment",
      paymentStatus: "unpaid",
      lessonsLimit: 8,
    },
    {
      id: "sch_sta_06",
      studentId: "sch_s03",
      tariffId: "sch_tariff_basic",
      startsAt: atOffset(-40, 0),
      endsAt: atOffset(-10, 23),
      price: "16000",
      status: "expired",
      paymentStatus: "paid",
      lessonsLimit: 8,
    },
    {
      id: "sch_sta_07",
      studentId: "sch_s09",
      tariffId: "sch_tariff_standard",
      startsAt: atOffset(-4, 0),
      endsAt: historyUntil,
      price: "22000",
      status: "active",
      paymentStatus: "paid",
      lessonsLimit: 48,
    },
  ];

  const extraPaid: Array<{ id: string; studentId: string; tariffId: string; price: string }> = [
    { id: "sch_sta_08", studentId: "sch_s04", tariffId: "sch_tariff_standard", price: "22000" },
    { id: "sch_sta_09", studentId: "sch_s05", tariffId: "sch_tariff_standard", price: "22000" },
    { id: "sch_sta_10", studentId: "sch_s06", tariffId: "sch_tariff_basic", price: "16000" },
    { id: "sch_sta_11", studentId: "sch_s07", tariffId: "sch_tariff_standard", price: "22000" },
    { id: "sch_sta_12", studentId: "sch_s08", tariffId: "sch_tariff_intensive", price: "32000" },
    { id: "sch_sta_13", studentId: "sch_s11", tariffId: "sch_tariff_standard", price: "22000" },
    { id: "sch_sta_14", studentId: "sch_s12", tariffId: "sch_tariff_basic", price: "16000" },
    { id: "sch_sta_15", studentId: "sch_s13", tariffId: "sch_tariff_standard", price: "22000" },
    { id: "sch_sta_16", studentId: "sch_s14", tariffId: "sch_tariff_basic", price: "16000" },
    { id: "sch_sta_17", studentId: "sch_s16", tariffId: "sch_tariff_standard", price: "22000" },
    { id: "sch_sta_18", studentId: "sch_s17", tariffId: "sch_tariff_intensive", price: "32000" },
  ];
  for (const extra of extraPaid) {
    assignments.push({
      id: extra.id,
      studentId: extra.studentId,
      tariffId: extra.tariffId,
      startsAt: historyFrom,
      endsAt: historyUntil,
      price: extra.price,
      status: "active",
      paymentStatus: "paid",
      lessonsLimit: 48,
    });
  }

  const tariffById = new Map(tariffs.map((x) => [x.id, x]));
  for (const a of assignments) {
    const tar = tariffById.get(a.tariffId);
    await db.insert(t.studentTariffAssignments).values({
      id: a.id,
      organizationId: SCHOOL_ORG_ID,
      studentId: a.studentId,
      tariffId: a.tariffId,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      priceSnapshot: a.price,
      currency: "RUB",
      status: a.status,
      paymentStatus: a.paymentStatus,
      lessonsLimitSnapshot: a.lessonsLimit,
      weeklyFrequencySnapshot: tar?.weeklyFrequency ?? null,
      durationDaysSnapshot: tar?.durationDays ?? null,
      tariffNameSnapshot: tar?.name ?? null,
    });
  }

  const payments = assignments.map((a, i) => {
    const n = String(i + 1).padStart(2, "0");
    if (a.paymentStatus === "unpaid") {
      return {
        id: `sch_pay_${n}`,
        studentId: a.studentId,
        assignmentId: a.id,
        amount: a.price,
        status: a.studentId === "sch_s15" ? ("failed" as const) : ("pending" as const),
        paidAt: null as Date | null,
        key: `school:pay:${n}`,
      };
    }
    return {
      id: `sch_pay_${n}`,
      studentId: a.studentId,
      assignmentId: a.id,
      amount: a.price,
      status: "paid" as const,
      paidAt: a.startsAt,
      key: `school:pay:${n}`,
    };
  });
  for (const p of payments) {
    await db.insert(t.payments).values({
      id: p.id,
      organizationId: SCHOOL_ORG_ID,
      studentId: p.studentId,
      assignmentId: p.assignmentId,
      amount: p.amount,
      currency: "RUB",
      status: p.status,
      provider: "stub",
      idempotencyKey: p.key,
      paidAt: p.paidAt,
      failureReason: p.status === "failed" ? "stub: card declined" : null,
    });
  }

  const scheduleFrom = atOffset(-70, 0);
  for (const sch of schedules) {
    await db.insert(t.lessonSchedules).values({
      id: sch.id,
      organizationId: SCHOOL_ORG_ID,
      teacherId: sch.teacherId,
      subject: sch.subject,
      weekdays: sch.weekdays,
      startTime: sch.startTime,
      durationMin: sch.durationMin,
      activeFrom: scheduleFrom,
      status: "active",
    });
    await db.insert(t.lessonScheduleStudents).values(
      sch.studentIds.map((studentId) => ({
        scheduleId: sch.id,
        studentId,
      }))
    );
  }

  const history = await seedSchoolCatalogAndHistory(
    db,
    SCHOOL_ORG_ID,
    now,
    schedules,
    { win1251Safe: options.win1251Safe }
  );

  await backfillLedgerFromAttendances(db, SCHOOL_ORG_ID);

  return {
    directors: 1,
    teachers: teachers.length,
    students: students.length,
    unassignedStudents: students.filter((s) => !s.teacherId).length,
    schedules: schedules.length,
    futureLessons: history.futureLessons,
    pastLessons: history.pastLessons,
    tariffs: tariffs.length,
    assignments: assignments.length,
    payments: payments.length,
    tests: history.tests,
    questions: history.questions,
    topics: history.topics,
    homeworkAssignments: history.homeworkAssignments,
  };
}

async function wipeSchoolOperationalData(db: DbLike) {
  const org = SCHOOL_ORG_ID;
  await db.delete(t.gradeEvents).where(eq(t.gradeEvents.organizationId, org));
  await db
    .delete(t.testAssignments)
    .where(eq(t.testAssignments.organizationId, org));
  await db.delete(t.tests).where(eq(t.tests.organizationId, org));
  await db
    .delete(t.tariffLessonLedger)
    .where(eq(t.tariffLessonLedger.organizationId, org));
  await db.delete(t.lessons).where(eq(t.lessons.organizationId, org));
  await db
    .delete(t.lessonSchedules)
    .where(eq(t.lessonSchedules.organizationId, org));
  await db.delete(t.topics).where(eq(t.topics.organizationId, org));
  await db
    .delete(t.topicSections)
    .where(eq(t.topicSections.organizationId, org));
  await db.delete(t.payments).where(eq(t.payments.organizationId, org));
  await db
    .delete(t.studentTariffAssignments)
    .where(eq(t.studentTariffAssignments.organizationId, org));
  await db.delete(t.tariffs).where(eq(t.tariffs.organizationId, org));
}

async function upsertSchoolUser(
  db: DbLike,
  row: {
    id: string;
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string;
    status: string;
  }
) {
  const [existing] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.id, row.id))
    .limit(1);
  if (existing) {
    await db
      .update(t.users)
      .set({
        email: row.email,
        fullName: row.fullName,
        phone: row.phone ?? null,
        status: row.status,
      })
      .where(eq(t.users.id, row.id));
    return;
  }
  await db.insert(t.users).values(row);
}

async function upsertById(
  db: DbLike,
  table: { id: { name: string } },
  row: { id: string } & Record<string, unknown>
) {
  const rest = { ...row };
  delete (rest as { id?: string }).id;
  await db.insert(table).values(row).onConflictDoUpdate({
    target: table.id,
    set: rest,
  });
}

function overlapsIso(
  a0: Date,
  a1: Date,
  b0: Date,
  b1: Date
): boolean {
  return a0.getTime() < b1.getTime() && b0.getTime() < a1.getTime();
}

/**
 * Проверяет фактические строки org_school_qa: счётчики и связи.
 * Не печатает секреты.
 */
export async function verifySchoolOrganization(
  db: DbLike,
  now: Date = new Date()
): Promise<{
  stats: SchoolSeedStats;
  errors: string[];
}> {
  const errors: string[] = [];
  const org = SCHOOL_ORG_ID;

  const memberships = await db
    .select()
    .from(t.memberships)
    .where(eq(t.memberships.organizationId, org));
  const teachers = await db
    .select()
    .from(t.teachers)
    .where(eq(t.teachers.organizationId, org));
  const students = await db
    .select()
    .from(t.students)
    .where(eq(t.students.organizationId, org));
  const schedules = await db
    .select()
    .from(t.lessonSchedules)
    .where(eq(t.lessonSchedules.organizationId, org));
  const lessons = await db
    .select()
    .from(t.lessons)
    .where(eq(t.lessons.organizationId, org));
  const tariffs = await db
    .select()
    .from(t.tariffs)
    .where(eq(t.tariffs.organizationId, org));
  const assignments = await db
    .select()
    .from(t.studentTariffAssignments)
    .where(eq(t.studentTariffAssignments.organizationId, org));
  const payments = await db
    .select()
    .from(t.payments)
    .where(eq(t.payments.organizationId, org));

  const directors = memberships.filter((m: { role: string }) => m.role === "director").length;
  const teacherIds = new Set(teachers.map((x: { id: string }) => x.id));
  const studentIds = new Set(students.map((x: { id: string }) => x.id));
  const unassigned = students.filter(
    (s: { primaryTeacherId: string | null }) => !s.primaryTeacherId
  ).length;
  const futureLessons = lessons.filter(
    (l: { startsAt: Date }) => l.startsAt.getTime() >= now.getTime()
  ).length;
  const pastLessons = lessons.filter(
    (l: { startsAt: Date }) => l.startsAt.getTime() < now.getTime()
  ).length;
  const testRows = await db
    .select()
    .from(t.tests)
    .where(eq(t.tests.organizationId, org));
  const topicRows = await db
    .select()
    .from(t.topics)
    .where(eq(t.topics.organizationId, org));
  const hwRows = await db
    .select()
    .from(t.testAssignments)
    .where(eq(t.testAssignments.organizationId, org));
  const questions = (testRows as Array<{ questionsPublic: unknown[] }>).reduce(
    (n, row) => n + (row.questionsPublic?.length ?? 0),
    0
  );

  const stats: SchoolSeedStats = {
    directors,
    teachers: teachers.length,
    students: students.length,
    unassignedStudents: unassigned,
    schedules: schedules.length,
    futureLessons,
    pastLessons,
    tariffs: tariffs.length,
    assignments: assignments.length,
    payments: payments.length,
    tests: testRows.length,
    questions,
    topics: topicRows.length,
    homeworkAssignments: hwRows.length,
  };

  const expectEq = (label: string, actual: number, expected: number) => {
    if (actual !== expected) {
      errors.push(`${label}: ожидалось ${expected}, получено ${actual}`);
    }
  };
  expectEq("directors", stats.directors, SCHOOL_SEED_EXPECTED.directors);
  expectEq("teachers", stats.teachers, SCHOOL_SEED_EXPECTED.teachers);
  expectEq("students", stats.students, SCHOOL_SEED_EXPECTED.students);
  expectEq(
    "unassignedStudents",
    stats.unassignedStudents,
    SCHOOL_SEED_EXPECTED.unassignedStudents
  );
  expectEq("schedules", stats.schedules, SCHOOL_SEED_EXPECTED.schedules);
  expectEq("tariffs", stats.tariffs, SCHOOL_SEED_EXPECTED.tariffs);
  expectEq("assignments", stats.assignments, SCHOOL_SEED_EXPECTED.assignments);
  expectEq("payments", stats.payments, SCHOOL_SEED_EXPECTED.payments);
  expectEq("tests", stats.tests, SCHOOL_SEED_EXPECTED.tests);
  if (stats.pastLessons < SCHOOL_SEED_EXPECTED.pastLessonsMin) {
    errors.push(
      `pastLessons: ожидалось ≥ ${SCHOOL_SEED_EXPECTED.pastLessonsMin}, получено ${stats.pastLessons}`
    );
  }
  if (stats.futureLessons < SCHOOL_SEED_EXPECTED.futureLessonsMin) {
    errors.push(
      `futureLessons: ожидалось ≥ ${SCHOOL_SEED_EXPECTED.futureLessonsMin}, получено ${stats.futureLessons}`
    );
  }
  if (stats.topics < SCHOOL_SEED_EXPECTED.topicsMin) {
    errors.push(
      `topics: ожидалось ≥ ${SCHOOL_SEED_EXPECTED.topicsMin}, получено ${stats.topics}`
    );
  }
  if (stats.homeworkAssignments < SCHOOL_SEED_EXPECTED.homeworkMin) {
    errors.push(
      `homework: ожидалось ≥ ${SCHOOL_SEED_EXPECTED.homeworkMin}, получено ${stats.homeworkAssignments}`
    );
  }

  for (const s of students) {
    if (s.primaryTeacherId && !teacherIds.has(s.primaryTeacherId)) {
      errors.push(`ученик ${s.id}: неизвестный преподаватель ${s.primaryTeacherId}`);
    }
  }

  const lessonIds = lessons.map((l: { id: string }) => l.id);
  const links =
    lessonIds.length > 0
      ? await db
          .select()
          .from(t.lessonStudents)
          .where(inArray(t.lessonStudents.lessonId, lessonIds))
      : [];

  const studentsByLesson = new Map<string, string[]>();
  for (const link of links) {
    if (!studentIds.has(link.studentId)) {
      errors.push(`занятие ${link.lessonId}: неизвестный ученик ${link.studentId}`);
    }
    const arr = studentsByLesson.get(link.lessonId) ?? [];
    arr.push(link.studentId);
    studentsByLesson.set(link.lessonId, arr);
  }

  for (const lesson of lessons) {
    if (!teacherIds.has(lesson.teacherId)) {
      errors.push(`занятие ${lesson.id}: неизвестный преподаватель ${lesson.teacherId}`);
    }
    const sid = studentsByLesson.get(lesson.id) ?? [];
    if (sid.length !== 1) {
      errors.push(`занятие ${lesson.id}: ожидался 1 ученик, получено ${sid.length}`);
    }
    if (
      lesson.status === "done" &&
      lesson.startsAt.getTime() > now.getTime()
    ) {
      errors.push(`занятие ${lesson.id}: проведено в будущем`);
    }
  }

  const tariffIds = new Set(tariffs.map((x: { id: string }) => x.id));
  type AssignmentRow = {
    id: string;
    studentId: string;
    tariffId: string;
  };
  const assignmentById = new Map<string, AssignmentRow>(
    (assignments as AssignmentRow[]).map((a) => [a.id, a])
  );
  for (const a of assignments as AssignmentRow[]) {
    if (!studentIds.has(a.studentId)) {
      errors.push(`тариф ${a.id}: неизвестный ученик ${a.studentId}`);
    }
    if (!tariffIds.has(a.tariffId)) {
      errors.push(`тариф ${a.id}: неизвестный тариф ${a.tariffId}`);
    }
  }
  for (const p of payments as Array<{
    id: string;
    studentId: string;
    assignmentId: string;
  }>) {
    const a = assignmentById.get(p.assignmentId);
    if (!a) {
      errors.push(`платёж ${p.id}: нет назначения ${p.assignmentId}`);
      continue;
    }
    if (a.studentId !== p.studentId) {
      errors.push(`платёж ${p.id}: ученик не совпадает с назначением`);
    }
  }

  const planned = lessons.filter(
    (l: { status: string }) => l.status === "planned"
  );
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      const a = planned[i];
      const b = planned[j];
      if (!overlapsIso(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) continue;
      const sa = new Set(studentsByLesson.get(a.id) ?? []);
      for (const sid of studentsByLesson.get(b.id) ?? []) {
        if (sa.has(sid)) {
          errors.push(`конфликт ученика ${sid}: ${a.id} / ${b.id}`);
        }
      }
    }
  }

  const attendances =
    lessonIds.length > 0
      ? await db
          .select()
          .from(t.attendances)
          .where(inArray(t.attendances.lessonId, lessonIds))
      : [];
  const ledger = await db
    .select()
    .from(t.tariffLessonLedger)
    .where(eq(t.tariffLessonLedger.organizationId, org));
  const lessonById = new Map(
    (lessons as Array<{ id: string; startsAt: Date; status: string }>).map(
      (l) => [l.id, l]
    )
  );
  const paidCovering = (
    studentId: string,
    at: Date
  ): boolean =>
    (assignments as Array<{
      studentId: string;
      paymentStatus: string;
      startsAt: Date;
    }>).some(
      (a) =>
        a.studentId === studentId &&
        a.paymentStatus === "paid" &&
        a.startsAt.getTime() <= at.getTime()
    );
  let expectedDebits = 0;
  for (const att of attendances as Array<{
    lessonId: string;
    studentId: string;
    status: string;
  }>) {
    if (att.status !== "present" && att.status !== "absent_unexcused") continue;
    const lesson = lessonById.get(att.lessonId);
    if (!lesson || lesson.status === "cancelled") continue;
    if (!paidCovering(att.studentId, lesson.startsAt)) continue;
    expectedDebits += 1;
  }
  const actualDebits = (
    ledger as Array<{ delta: number; reason: string }>
  ).filter((e) => e.delta === -1 && e.reason !== "reversal").length;
  if (actualDebits !== expectedDebits) {
    errors.push(
      `ledger: ожидалось ${expectedDebits} списаний, получено ${actualDebits}`
    );
  }

  const attempts =
    hwRows.length > 0
      ? await db
          .select()
          .from(t.testAttempts)
          .where(
            inArray(
              t.testAttempts.assignmentId,
              (hwRows as Array<{ id: string }>).map((a) => a.id)
            )
          )
      : [];
  for (const att of attempts as Array<{ attemptNumber: number; id: string }>) {
    if (att.attemptNumber > 2) {
      errors.push(`попытка ${att.id}: номер ${att.attemptNumber} > 2`);
    }
  }

  return { stats, errors };
}
