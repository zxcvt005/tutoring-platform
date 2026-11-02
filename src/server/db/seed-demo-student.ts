/**
 * Локальная история демо-ученика «Александр Демонстрационный».
 * Повторный запуск удаляет и заново пишет только его строки.
 * Не вызывается из start:local / start:local:keep.
 */
import { and, eq, ne, sql } from "drizzle-orm";

import {
  addAppDateKey,
  appDateKey,
  appZonedParts,
  fromAppDateTime,
} from "@/lib/app-time";
import { homeworkSectionFor } from "@/lib/homework-list";
import { isMissedNextLesson } from "@/lib/homework-missed";
import { trainerHomeSummary } from "@/lib/formula-trainer/display";
import type { TestQuestion, StudentAnswer } from "@/lib/types";
import { parseVideoLink } from "@/lib/theory/video";
import { sniffTheoryFile } from "@/lib/theory/file-sniff";
import type { TheoryAllowedMime } from "@/lib/theory/constants";
import { gradeSubmission, computeFinalScore } from "@/lib/tests/grading";
import { summarizeAttempts } from "@/lib/tests/attempts";
import { hashPassword } from "@/server/auth/password";
import { splitQuestion } from "@/server/db/question-split";
import * as t from "@/server/db/schema";
import { SCHOOL_ORG_ID } from "@/server/db/seed-school";
import { DEMO_PASSWORD } from "@/server/db/seed";
import {
  DEMO_ALEX_CHAT_ID,
  DEMO_ALEX_EMAIL,
  DEMO_ALEX_FULL_NAME,
  DEMO_ALEX_RATING_SCORES,
  DEMO_ALEX_SCHEDULE_ID,
  DEMO_ALEX_STUDENT_ID,
  DEMO_ALEX_TOPICS,
  DEMO_ALEX_USER_ID,
  HOMEWORK_BLUEPRINT,
  collectStudySlots,
  pastLessonKinds,
  ratingComment,
  splitTariffDebits,
  type DemoLessonKind,
  type HomeworkBlueprint,
  type HomeworkPattern,
} from "@/server/db/demo-student-plan";
import type { AppDb } from "@/server/db/types";
import {
  deleteTheoryObject,
  putTheoryObject,
} from "@/server/media/theory-storage";
import { resolveChatStorageDriver } from "@/server/media/chat-storage";
import { ensureDefaultProducts } from "@/server/services/products-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { getFormulaTrainerState } from "@/server/services/formula-trainer-service";
import { listVideoCalls } from "@/server/services/video-calls-service";
import type { AuthContext } from "@/server/authz/context";

const ORG = SCHOOL_ORG_ID;
const STUDENT = DEMO_ALEX_STUDENT_ID;
const USER = DEMO_ALEX_USER_ID;

const TARIFF_PREV = "demo_alex_tariff_prev";
const TARIFF_CUR = "demo_alex_tariff_cur";
const TARIFF_INTENS = "demo_alex_tariff_intens";
const ASSIGN_PREV = "demo_alex_sta_prev";
const ASSIGN_CUR = "demo_alex_sta_cur";
const ASSIGN_PENDING = "demo_alex_sta_pending";
const ASSIGN_REJECTED = "demo_alex_sta_rejected";

const VIDEOS = {
  kinematics: "https://rutube.ru/video/1d69169376fee52d473791b74c200ff3/",
  kinematicsPractice: "https://rutube.ru/video/5f37010b2ec8db9288316a18f9485f7c/",
  newton: "https://rutube.ru/video/70f5bef0064f2136abf7d8c3c2833bcd/",
  impulse: "https://rutube.ru/video/51a30efe20cf6499cb2a1df61a991080/",
  thermo: "https://rutube.ru/video/ac225991df094c00a904ea7a3652f039/",
  field: "https://rutube.ru/video/c6bcd037844169484adcddfbfc71fc5b/",
  current: "https://rutube.ru/video/2afc15a467b31146c8e8e1a831fdef15/",
} as const;

type BuiltLesson = {
  id: string;
  key: string;
  startsAt: Date;
  endsAt: Date;
  kind: DemoLessonKind;
  topic: string;
  scheduleId: string | null;
  occurrenceKey: string | null;
};

export type DemoStudentSeedStats = {
  studentId: string;
  email: string;
  teacherId: string;
  teacherName: string;
  lessons: number;
  pastLessons: number;
  upcomingLessons: number;
  ratings: number;
  unratedPresent: number;
  homework: number;
  theory: number;
  calls: number;
  payments: number;
  tariffRemaining: number;
  tariffUsed: number;
  tariffLimit: number;
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function money(value: number): string {
  return value.toFixed(2);
}

function num(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return value.toFixed(2);
}

function overlaps(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0.getTime() < b1.getTime() && b0.getTime() < a1.getTime();
}

function topicAt(index: number): string {
  const base = DEMO_ALEX_TOPICS[index % DEMO_ALEX_TOPICS.length]!;
  return index >= DEMO_ALEX_TOPICS.length ? `Повторение: ${base}` : base;
}

function videoOf(url: string) {
  const parsed = parseVideoLink(url);
  if (!parsed.ok) {
    throw new Error(`Ссылка на видео не разбирается: ${parsed.error}`);
  }
  return parsed;
}

function questionsFor(topic: string, variant: 0 | 1 | 2): TestQuestion[] {
  const single: TestQuestion = {
    id: "q_single",
    type: "single_choice",
    prompt: `${topic}. Куда направлен вектор мгновенной скорости?`,
    maxScore: 1,
    options: [
      { id: "a", text: "По касательной к траектории" },
      { id: "b", text: "По нормали к траектории" },
      { id: "c", text: "Всегда вертикально вниз" },
    ],
    correctOptionIds: ["a"],
    explanation: "Скорость направлена по касательной к траектории.",
  };
  const multi: TestQuestion = {
    id: "q_multi",
    type: "multiple_choice",
    prompt: `${topic}. Что может сохраняться в замкнутой системе?`,
    maxScore: 1,
    options: [
      { id: "a", text: "Импульс" },
      { id: "b", text: "Механическая энергия, если работа непотенциальных сил равна нулю" },
      { id: "c", text: "Скорость каждого тела по отдельности" },
    ],
    correctOptionIds: ["a", "b"],
    explanation: "Импульс сохраняется в замкнутой системе. Механическая энергия сохраняется, если нет работы непотенциальных сил.",
  };
  const numeric: TestQuestion = {
    id: "q_num",
    type: "numeric",
    prompt: `${topic}. Скорость выросла на 10 м/с за 5 с. Найдите ускорение, м/с^2.`,
    maxScore: 1,
    answerKind: "number",
    correctAnswers: ["2"],
    numericTolerance: 0.05,
    explanation: "a = dv/dt = 10/5 = 2.",
  };
  const short: TestQuestion = {
    id: "q_short",
    type: "short_answer",
    prompt: `${topic}. Как называется линия, по которой движется точка?`,
    maxScore: 1,
    answerKind: "text",
    correctAnswers: ["траектория"],
    explanation: "Траектория — линия движения.",
  };
  const essay: TestQuestion = {
    id: "q_essay",
    type: "essay",
    prompt: `${topic}. Объясните, зачем в задаче выбирать ось вдоль ускорения.`,
    maxScore: 2,
    explanation: "На эту ось ускорение проецируется целиком, остальные проекции проще.",
  };
  const matching: TestQuestion = {
    id: "q_match",
    type: "matching",
    prompt: `${topic}. Сопоставьте величину и формулу.`,
    maxScore: 2,
    matchingPairs: [
      { id: "p1", left: "Импульс", right: "p = mv" },
      { id: "p2", left: "Второй закон Ньютона", right: "F = ma" },
      { id: "p3", left: "Кинетическая энергия", right: "mv^2/2" },
    ],
  };
  const ordering: TestQuestion = {
    id: "q_order",
    type: "ordering",
    prompt: `${topic}. Расставьте шаги решения.`,
    maxScore: 1,
    orderItems: [
      { id: "o1", text: "Выбрать систему отсчёта" },
      { id: "o2", text: "Записать силы" },
      { id: "o3", text: "Спроецировать на оси" },
      { id: "o4", text: "Решить уравнения" },
    ],
  };
  if (variant === 0) return [single, multi, numeric, short];
  if (variant === 1) return [single, essay, matching, ordering];
  return [multi, numeric, short, ordering];
}

function answerFor(question: TestQuestion, correct: boolean, pattern: HomeworkPattern): StudentAnswer {
  if (question.type === "essay") {
    const manual =
      pattern === "essay-reviewed" || pattern === "perfect"
        ? question.maxScore
        : pattern === "partial"
          ? 1
          : undefined;
    return {
      questionId: question.id,
      textAnswer: correct
        ? "Ось вдоль ускорения убирает лишние нулевые проекции, и уравнение получается короче."
        : "Записал только силу тяжести и не объяснил выбор оси.",
      manualScore: manual,
      teacherComment:
        pattern === "essay-reviewed"
          ? "Ход верный, термины на месте."
          : pattern === "partial"
            ? "Идея есть, не хватает связи с проекцией."
            : undefined,
    };
  }
  if (!correct) {
    if (question.type === "single_choice") {
      return {
        questionId: question.id,
        selectedOptionIds: ["b"],
        teacherComment: "Скорость не направлена по нормали. Нормаль связана с изменением направления.",
      };
    }
    if (question.type === "multiple_choice") {
      return {
        questionId: question.id,
        selectedOptionIds: ["a"],
        teacherComment: "Импульс отмечен верно, второе условие тоже нужно.",
      };
    }
    if (question.type === "numeric") {
      return {
        questionId: question.id,
        textAnswer: "5",
        teacherComment: "Делить нужно изменение скорости на время: 10/5, а не наоборот.",
      };
    }
    if (question.type === "short_answer") {
      return {
        questionId: question.id,
        textAnswer: "перемещение",
        teacherComment: "Перемещение — вектор, а линия движения называется иначе.",
      };
    }
    if (question.type === "matching") {
      const pairs = question.matchingPairs ?? [];
      const matching: Record<string, string> = {};
      if (pairs[0] && pairs[1]) {
        matching[pairs[0].id] = pairs[1].id;
        matching[pairs[1].id] = pairs[0].id;
      }
      if (pairs[2]) matching[pairs[2].id] = pairs[2].id;
      return {
        questionId: question.id,
        matching,
        teacherComment: "Импульс и второй закон Ньютона перепутаны местами.",
      };
    }
    const ids = (question.orderItems ?? []).map((item) => item.id);
    return {
      questionId: question.id,
      order: [ids[1], ids[0], ...ids.slice(2)].filter((id): id is string => Boolean(id)),
      teacherComment: "Сначала выбирают систему отсчёта, потом записывают силы.",
    };
  }
  if (question.type === "single_choice" || question.type === "multiple_choice") {
    return { questionId: question.id, selectedOptionIds: [...(question.correctOptionIds ?? [])] };
  }
  if (question.type === "numeric" || question.type === "short_answer") {
    return { questionId: question.id, textAnswer: question.correctAnswers?.[0] ?? "" };
  }
  if (question.type === "matching") {
    const matching: Record<string, string> = {};
    for (const pair of question.matchingPairs ?? []) matching[pair.id] = pair.id;
    return { questionId: question.id, matching };
  }
  return {
    questionId: question.id,
    order: (question.orderItems ?? []).map((item) => item.id),
  };
}

function answersFor(
  questions: TestQuestion[],
  pattern: HomeworkPattern
): { first: StudentAnswer[]; second: StudentAnswer[] } {
  const right = (index: number) => answerFor(questions[index]!, true, pattern);
  const wrong = (index: number) => answerFor(questions[index]!, false, pattern);
  if (pattern === "perfect" || pattern === "essay-reviewed") {
    return { first: questions.map((_, index) => right(index)), second: [] };
  }
  if (pattern === "partial") {
    return {
      first: questions.map((_, index) => (index === 1 || index === 2 ? wrong(index) : right(index))),
      second: [],
    };
  }
  if (pattern === "second-fix") {
    return {
      first: questions.map((_, index) => (index === 1 ? wrong(index) : right(index))),
      second: [right(1)],
    };
  }
  if (pattern === "essay-pending") {
    return {
      first: questions.map((question, index) =>
        question.type === "essay" ? answerFor(question, true, "essay-pending") : right(index)
      ),
      second: [],
    };
  }
  if (pattern === "blank") {
    return { first: questions.slice(0, -1).map((_, index) => right(index)), second: [] };
  }
  if (pattern === "draft") {
    return { first: questions.slice(0, 2).map((_, index) => right(index)), second: [] };
  }
  if (pattern === "rework") {
    return {
      first: questions.map((_, index) => (index === 0 ? wrong(index) : right(index))),
      second: [],
    };
  }
  return {
    first: questions.map((_, index) => (index === 0 ? wrong(index) : right(index))),
    second: [right(0)],
  };
}

function payloadOf(answer: StudentAnswer): Record<string, unknown> {
  return {
    selectedOptionIds: answer.selectedOptionIds ?? [],
    textAnswer: answer.textAnswer ?? "",
    matching: answer.matching ?? {},
    order: answer.order ?? [],
  };
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, end]);
}

function pdfBytes(latinTitle: string): Buffer {
  const safe = latinTitle.replace(/[()\\]/g, " ");
  const stream = `BT /F1 14 Tf 48 120 Td (${safe}) Tj ET`;
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 240]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${Buffer.byteLength(stream)}>>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function docxBytes(text: string): Buffer {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text.replace(/[<&>]/g, " ")}</w:t></w:r></w:p></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(document, "utf8") },
  ]);
}

function docBytes(): Buffer {
  const header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const note = Buffer.from(
    "\nNeodin local demo conspect. Legacy DOC container for the student library.\n",
    "utf8"
  );
  return Buffer.concat([header, Buffer.alloc(64), note]);
}

function fileBytes(
  kind: "pdf" | "docx" | "doc",
  title: string
): { bytes: Buffer; mime: TheoryAllowedMime; filename: string } {
  if (kind === "pdf") {
    const bytes = pdfBytes(`Neodin. ${title}`);
    return { bytes, mime: "application/pdf", filename: `${title}.pdf` };
  }
  if (kind === "docx") {
    const bytes = docxBytes(`Конспект. ${title}. Короткая локальная памятка для демо-ученика.`);
    return {
      bytes,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${title}.docx`,
    };
  }
  return {
    bytes: docBytes(),
    mime: "application/msword",
    filename: `${title}.doc`,
  };
}

async function fingerprint(db: AppDb): Promise<string> {
  const people = await db
    .select({
      id: t.students.id,
      name: t.students.fullName,
      teacher: t.students.primaryTeacherId,
      grade: t.students.grade,
      status: t.students.status,
    })
    .from(t.students)
    .where(and(eq(t.students.organizationId, ORG), ne(t.students.id, STUDENT)));
  const [homework] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.testAssignments)
    .where(and(eq(t.testAssignments.organizationId, ORG), ne(t.testAssignments.studentId, STUDENT)));
  const [links] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessonStudents)
    .where(ne(t.lessonStudents.studentId, STUDENT));
  const [payments] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.payments)
    .where(and(eq(t.payments.organizationId, ORG), ne(t.payments.studentId, STUDENT)));
  const [lessons] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessons)
    .where(and(eq(t.lessons.organizationId, ORG), sql`${t.lessons.id} not like 'demo_alex_%'`));
  people.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    people,
    homework: Number(homework?.n ?? 0),
    links: Number(links?.n ?? 0),
    payments: Number(payments?.n ?? 0),
    lessons: Number(lessons?.n ?? 0),
  });
}

async function clearDemoStudent(db: AppDb) {
  const fileRows = await db
    .select({ key: t.theoryFiles.objectKey })
    .from(t.theoryFiles)
    .where(sql`${t.theoryFiles.materialId} like 'demo_alex_th_%'`);

  await db.execute(sql`
    delete from grade_events
    where assignment_id in (select id from test_assignments where student_id = ${STUDENT})
  `);
  await db.execute(sql`
    delete from attempt_answers
    where attempt_id in (
      select ta.id from test_attempts ta
      join test_assignments a on a.id = ta.assignment_id
      where a.student_id = ${STUDENT}
    )
  `);
  await db.execute(sql`
    delete from test_attempts
    where assignment_id in (select id from test_assignments where student_id = ${STUDENT})
  `);
  await db.execute(sql`
    delete from assignment_answers
    where assignment_id in (select id from test_assignments where student_id = ${STUDENT})
  `);
  await db.execute(sql`
    delete from assignment_snapshots
    where assignment_id in (select id from test_assignments where student_id = ${STUDENT})
  `);
  await db.execute(sql`delete from theory_assignments where student_id = ${STUDENT}`);
  await db.execute(sql`delete from test_assignments where student_id = ${STUDENT}`);
  await db.execute(sql`
    update theory_materials
    set current_version_id = null, test_id = null
    where id like 'demo_alex_th_%'
  `);
  await db.execute(sql`delete from theory_files where material_id like 'demo_alex_th_%'`);
  await db.execute(sql`delete from theory_material_versions where material_id like 'demo_alex_th_%'`);
  await db.execute(sql`delete from theory_materials where id like 'demo_alex_th_%'`);
  await db.execute(sql`delete from test_answer_keys where test_id like 'demo_alex_test_%'`);
  await db.execute(sql`delete from tests where id like 'demo_alex_test_%'`);
  await db.execute(sql`delete from lesson_ratings where student_id = ${STUDENT}`);
  await db.execute(sql`delete from attendances where student_id = ${STUDENT}`);
  await db.execute(sql`delete from tariff_lesson_debit_state where student_id = ${STUDENT}`);
  await db.execute(sql`delete from tariff_lesson_ledger where student_id = ${STUDENT}`);
  await db.execute(sql`delete from lesson_topics where lesson_id like 'demo_alex_les_%'`);
  await db.execute(sql`delete from lesson_students where lesson_id like 'demo_alex_les_%'`);
  await db.execute(sql`delete from lesson_schedule_exceptions where schedule_id = ${DEMO_ALEX_SCHEDULE_ID}`);
  await db.execute(sql`delete from lessons where id like 'demo_alex_les_%'`);
  await db.execute(sql`delete from lesson_schedule_students where schedule_id = ${DEMO_ALEX_SCHEDULE_ID}`);
  await db.execute(sql`delete from lesson_schedules where id = ${DEMO_ALEX_SCHEDULE_ID}`);
  await db.execute(sql`delete from payments where student_id = ${STUDENT}`);
  await db.execute(sql`delete from student_tariff_assignments where student_id = ${STUDENT}`);
  await db.execute(sql`delete from tariff_products where tariff_id like 'demo_alex_tariff_%'`);
  await db.execute(sql`delete from tariffs where id like 'demo_alex_tariff_%'`);
  await db.execute(sql`delete from formula_trainer_sessions where student_id = ${STUDENT}`);
  await db.execute(sql`delete from formula_trainer_questions where student_id = ${STUDENT}`);
  await db.execute(sql`delete from formula_trainer_progress where student_id = ${STUDENT}`);
  await db.execute(sql`delete from formula_trainer_settings where student_id = ${STUDENT}`);
  await db.execute(sql`delete from video_call_participants where call_id like 'demo_alex_vc_%'`);
  await db.execute(sql`delete from video_calls where id like 'demo_alex_vc_%'`);
  await db.execute(sql`delete from chat_read_cursors where chat_id = ${DEMO_ALEX_CHAT_ID}`);
  await db.execute(sql`delete from chat_messages where chat_id = ${DEMO_ALEX_CHAT_ID}`);
  await db.execute(sql`delete from chats where id = ${DEMO_ALEX_CHAT_ID}`);
  await db.execute(sql`delete from user_notes where id like 'demo_alex_note_%'`);

  for (const row of fileRows) {
    try {
      await deleteTheoryObject(row.key);
    } catch {
      /* файла уже нет */
    }
  }
}

async function assertLocalStorage() {
  if (resolveChatStorageDriver() === "s3") {
    throw new Error(
      "Отказ: хранилище файлов смотрит в S3. Демо-конспекты пишутся только на локальный диск."
    );
  }
}

export async function seedDemoStudent(
  db: AppDb,
  now = new Date()
): Promise<DemoStudentSeedStats> {
  await assertLocalStorage();
  const [org] = await db
    .select({ id: t.organizations.id })
    .from(t.organizations)
    .where(eq(t.organizations.id, ORG))
    .limit(1);
  if (!org) {
    throw new Error(
      "Отказ: организация org_school_qa не найдена. Сначала поднимите локальную школу, не запускайте этот скрипт на другой базе."
    );
  }

  const teachers = await db
    .select()
    .from(t.teachers)
    .where(eq(t.teachers.organizationId, ORG));
  const teacher =
    teachers.find((row) => row.id === "sch_t1" && row.status === "active") ??
    teachers.find(
      (row) =>
        row.status === "active" &&
        (row.subjects ?? []).some((subject) => subject.toLowerCase().includes("физик"))
    ) ??
    null;
  if (!teacher?.userId) {
    throw new Error("Отказ: в локальной школе нет активного преподавателя физики с учётной записью.");
  }

  const [emailOwner] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.email, DEMO_ALEX_EMAIL))
    .limit(1);
  if (emailOwner && emailOwner.id !== USER) {
    throw new Error("Отказ: почта демо-ученика уже занята другой учётной записью. Ничего не изменено.");
  }
  const [existingStudent] = await db
    .select()
    .from(t.students)
    .where(eq(t.students.id, STUDENT))
    .limit(1);
  if (existingStudent && existingStudent.organizationId !== ORG) {
    throw new Error("Отказ: id demo_alex занят учеником другой организации.");
  }
  if (existingStudent?.userId && existingStudent.userId !== USER) {
    throw new Error("Отказ: demo_alex привязан к другому пользователю. Существующие ученики не перезаписываются.");
  }

  const before = await fingerprint(db);
  await clearDemoStudent(db);

  const occupied = await db
    .select({ startsAt: t.lessons.startsAt, endsAt: t.lessons.endsAt })
    .from(t.lessons)
    .where(eq(t.lessons.teacherId, teacher.id));

  const timeCandidates = ["19:30", "20:40", "13:20", "12:05"];
  let startTime = "";
  let slots = collectStudySlots(now, "19:30");
  for (const candidate of timeCandidates) {
    const probe = collectStudySlots(now, candidate);
    const instants = [...probe.past, ...probe.future].map((key) => {
      const startsAt = fromAppDateTime(key, candidate);
      return { startsAt, endsAt: addMinutes(startsAt, 60) };
    });
    const busy = instants.some((slot) =>
      occupied.some((lesson) => overlaps(slot.startsAt, slot.endsAt, lesson.startsAt, lesson.endsAt))
    );
    if (!busy) {
      startTime = candidate;
      slots = probe;
      break;
    }
  }
  if (!startTime) {
    throw new Error("Отказ: у выбранного преподавателя нет свободного регулярного окна пн/чт.");
  }
  if (slots.past.length !== 26) {
    throw new Error(`Ожидалось 26 прошедших занятий, получилось ${slots.past.length}.`);
  }

  const kinds = pastLessonKinds(slots.past.length);
  const lessons: BuiltLesson[] = [];
  slots.past.forEach((key, index) => {
    const startsAt = fromAppDateTime(key, startTime);
    lessons.push({
      id: `demo_alex_les_${String(index + 1).padStart(2, "0")}`,
      key,
      startsAt,
      endsAt: addMinutes(startsAt, 60),
      kind: kinds[index]!,
      topic: topicAt(index),
      scheduleId: DEMO_ALEX_SCHEDULE_ID,
      occurrenceKey: key,
    });
  });
  slots.future.forEach((key, index) => {
    const startsAt = fromAppDateTime(key, startTime);
    lessons.push({
      id: `demo_alex_les_f${String(index + 1).padStart(2, "0")}`,
      key,
      startsAt,
      endsAt: addMinutes(startsAt, 60),
      kind: "upcoming",
      topic: topicAt(slots.past.length + index),
      scheduleId: DEMO_ALEX_SCHEDULE_ID,
      occurrenceKey: key,
    });
  });

  let wednesday: { key: string; startsAt: Date; endsAt: Date } | null = null;
  for (let shift = 1; shift <= 21; shift += 1) {
    const key = addAppDateKey(appDateKey(now), shift);
    const startsAt = fromAppDateTime(key, startTime);
    if (appZonedParts(startsAt).weekday !== 3) continue;
    const endsAt = addMinutes(startsAt, 60);
    const busy = occupied.some((lesson) =>
      overlaps(startsAt, endsAt, lesson.startsAt, lesson.endsAt)
    );
    if (busy) continue;
    wednesday = { key, startsAt, endsAt };
    break;
  }
  if (wednesday) {
    lessons.push({
      id: "demo_alex_les_wed",
      key: wednesday.key,
      startsAt: wednesday.startsAt,
      endsAt: wednesday.endsAt,
      kind: "upcoming",
      topic: "Постоянный ток",
      scheduleId: null,
      occurrenceKey: null,
    });
  }

  const present = lessons.filter((lesson) => lesson.kind === "present");
  const ratedLessons = present.slice(0, -2);
  const unratedLessons = present.slice(-2);
  if (ratedLessons.length !== DEMO_ALEX_RATING_SCORES.length) {
    throw new Error(
      `Не сходится число оценок: явок ${present.length}, к оценке ${ratedLessons.length}, шкала ${DEMO_ALEX_RATING_SCORES.length}.`
    );
  }

  const debitLessons = lessons.filter(
    (lesson) => lesson.kind === "present" || lesson.kind === "unexcused"
  );
  const tariff = splitTariffDebits(debitLessons.length);
  const currentDebits = debitLessons.slice(tariff.previousUsed);
  const currentStartKey = currentDebits[0]?.key ?? appDateKey(now);
  const prevEndKey = addAppDateKey(currentStartKey, -1);
  const courseStart = fromAppDateTime(slots.past[0]!, "00:00");
  const prevEnd = fromAppDateTime(prevEndKey, "23:00");
  const currentStart = fromAppDateTime(currentStartKey, "00:10");
  const currentEnd = fromAppDateTime(addAppDateKey(appDateKey(now), 28), "23:00");
  if (!(prevEnd > courseStart) || !(currentEnd > currentStart)) {
    throw new Error("Некорректные даты тарифа.");
  }
  const pendingStart = addMinutes(currentEnd, 60);
  const pendingEnd = addMinutes(pendingStart, 56 * 24 * 60);
  const rejectedEnd = addMinutes(courseStart, 10 * 24 * 60);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [userRow] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.id, USER))
    .limit(1);
  if (userRow) {
    await db
      .update(t.users)
      .set({
        email: DEMO_ALEX_EMAIL,
        passwordHash,
        fullName: DEMO_ALEX_FULL_NAME,
        phone: "+7 900 000-11-11",
        status: "active",
        updatedAt: now,
      })
      .where(eq(t.users.id, USER));
  } else {
    await db.insert(t.users).values({
      id: USER,
      email: DEMO_ALEX_EMAIL,
      passwordHash,
      fullName: DEMO_ALEX_FULL_NAME,
      phone: "+7 900 000-11-11",
      status: "active",
      createdAt: courseStart,
      updatedAt: now,
    });
  }

  const [membership] = await db
    .select({ id: t.memberships.id })
    .from(t.memberships)
    .where(eq(t.memberships.userId, USER))
    .limit(1);
  if (membership && membership.id !== "mem_demo_alex") {
    throw new Error("Отказ: у демо-пользователя уже есть другое членство.");
  }
  if (!membership) {
    await db.insert(t.memberships).values({
      id: "mem_demo_alex",
      organizationId: ORG,
      userId: USER,
      role: "student",
      createdAt: courseStart,
      updatedAt: now,
    });
  }

  const studentValues = {
    organizationId: ORG,
    userId: USER,
    primaryTeacherId: teacher.id,
    fullName: DEMO_ALEX_FULL_NAME,
    grade: "11",
    contacts: DEMO_ALEX_EMAIL,
    telegram: "@demo_alex_neodin",
    phone: "+7 900 000-11-11",
    parentContacts: "Мама, демо-контакт, не настоящий номер +7 900 000-11-12",
    status: "active" as const,
    notes: "Демонстрационный ученик для проверки Аудитории. Не настоящий человек.",
    purchaseTariffId: null,
    updatedAt: now,
  };
  if (existingStudent) {
    await db.update(t.students).set(studentValues).where(eq(t.students.id, STUDENT));
  } else {
    await db.insert(t.students).values({
      id: STUDENT,
      ...studentValues,
      createdAt: courseStart,
    });
  }

  const product = await ensureDefaultProducts(db, ORG);
  const lessonPrice = 1500;
  await db.insert(t.tariffs).values([
    {
      id: TARIFF_PREV,
      organizationId: ORG,
      name: "Стандарт, 12 занятий",
      price: money(tariff.previousLimit * lessonPrice),
      currency: "RUB",
      durationDays: 56,
      lessonsLimit: tariff.previousLimit,
      weeklyFrequency: 2,
      includesText: "Индивидуальные занятия по физике и домашние задания",
      features: ["individual_lessons", "homework"],
      status: "active",
      adminNotes: "Пакет только демо-ученика Александра.",
      createdAt: courseStart,
      updatedAt: now,
    },
    {
      id: TARIFF_CUR,
      organizationId: ORG,
      name: "Стандарт, занятия и тренажёр",
      price: money(tariff.currentLimit * lessonPrice),
      currency: "RUB",
      durationDays: 56,
      lessonsLimit: tariff.currentLimit,
      weeklyFrequency: 2,
      includesText: "Занятия, домашние задания и тренажёр формул",
      features: ["individual_lessons", "homework"],
      status: "active",
      adminNotes: "Текущий пакет только демо-ученика Александра.",
      createdAt: currentStart,
      updatedAt: now,
    },
    {
      id: TARIFF_INTENS,
      organizationId: ORG,
      name: "Интенсив ЕГЭ",
      price: "32000.00",
      currency: "RUB",
      durationDays: 45,
      lessonsLimit: 16,
      weeklyFrequency: 3,
      includesText: "Интенсив и разбор вариантов",
      features: ["individual_lessons", "homework"],
      status: "active",
      adminNotes: "Отклонённая демо-попытка оплаты, другим ученикам не назначается.",
      createdAt: courseStart,
      updatedAt: now,
    },
  ]);
  await db.insert(t.tariffProducts).values({
    tariffId: TARIFF_CUR,
    productId: product.id,
    organizationId: ORG,
    createdAt: currentStart,
  });
  await db
    .update(t.students)
    .set({ purchaseTariffId: TARIFF_CUR, updatedAt: now })
    .where(eq(t.students.id, STUDENT));

  await db.insert(t.studentTariffAssignments).values([
    {
      id: ASSIGN_PREV,
      organizationId: ORG,
      studentId: STUDENT,
      tariffId: TARIFF_PREV,
      startsAt: courseStart,
      endsAt: prevEnd,
      priceSnapshot: money(tariff.previousLimit * lessonPrice),
      currency: "RUB",
      status: "expired",
      paymentStatus: "paid",
      lessonsLimitSnapshot: tariff.previousLimit,
      weeklyFrequencySnapshot: 2,
      durationDaysSnapshot: 56,
      tariffNameSnapshot: "Стандарт, 12 занятий",
      createdAt: courseStart,
      updatedAt: prevEnd,
    },
    {
      id: ASSIGN_CUR,
      organizationId: ORG,
      studentId: STUDENT,
      tariffId: TARIFF_CUR,
      startsAt: currentStart,
      endsAt: currentEnd,
      priceSnapshot: money(tariff.currentLimit * lessonPrice),
      currency: "RUB",
      status: "active",
      paymentStatus: "paid",
      lessonsLimitSnapshot: tariff.currentLimit,
      weeklyFrequencySnapshot: 2,
      durationDaysSnapshot: 56,
      tariffNameSnapshot: "Стандарт, занятия и тренажёр",
      createdAt: currentStart,
      updatedAt: now,
    },
    {
      id: ASSIGN_PENDING,
      organizationId: ORG,
      studentId: STUDENT,
      tariffId: TARIFF_CUR,
      startsAt: pendingStart,
      endsAt: pendingEnd,
      priceSnapshot: money(tariff.currentLimit * lessonPrice),
      currency: "RUB",
      status: "pending_payment",
      paymentStatus: "unpaid",
      lessonsLimitSnapshot: tariff.currentLimit,
      weeklyFrequencySnapshot: 2,
      durationDaysSnapshot: 56,
      tariffNameSnapshot: "Продление стандарта",
      createdAt: addMinutes(now, -2 * 24 * 60),
      updatedAt: now,
    },
    {
      id: ASSIGN_REJECTED,
      organizationId: ORG,
      studentId: STUDENT,
      tariffId: TARIFF_INTENS,
      startsAt: courseStart,
      endsAt: rejectedEnd,
      priceSnapshot: "32000.00",
      currency: "RUB",
      status: "cancelled",
      paymentStatus: "unpaid",
      lessonsLimitSnapshot: 16,
      weeklyFrequencySnapshot: 3,
      durationDaysSnapshot: 45,
      tariffNameSnapshot: "Интенсив ЕГЭ",
      createdAt: addMinutes(courseStart, 3 * 24 * 60),
      updatedAt: addMinutes(courseStart, 4 * 24 * 60),
    },
  ]);

  await db.insert(t.payments).values([
    {
      id: "demo_alex_pay_prev",
      organizationId: ORG,
      studentId: STUDENT,
      assignmentId: ASSIGN_PREV,
      amount: money(tariff.previousLimit * lessonPrice),
      currency: "RUB",
      status: "paid",
      provider: "stub",
      idempotencyKey: "demo-alex:pay:prev",
      paidAt: courseStart,
      metadata: { demo: true, note: "Локальная запись, платёжный провайдер не вызывался" },
      createdAt: courseStart,
      updatedAt: courseStart,
    },
    {
      id: "demo_alex_pay_cur",
      organizationId: ORG,
      studentId: STUDENT,
      assignmentId: ASSIGN_CUR,
      amount: money(tariff.currentLimit * lessonPrice),
      currency: "RUB",
      status: "paid",
      provider: "stub",
      idempotencyKey: "demo-alex:pay:cur",
      paidAt: currentStart,
      metadata: { demo: true, note: "Локальная запись, платёжный провайдер не вызывался" },
      createdAt: currentStart,
      updatedAt: currentStart,
    },
    {
      id: "demo_alex_pay_pending",
      organizationId: ORG,
      studentId: STUDENT,
      assignmentId: ASSIGN_PENDING,
      amount: money(tariff.currentLimit * lessonPrice),
      currency: "RUB",
      status: "pending",
      provider: "stub",
      idempotencyKey: "demo-alex:pay:pending",
      metadata: { demo: true, note: "Ожидает подтверждения, денег не списывали" },
      createdAt: addMinutes(now, -2 * 24 * 60),
      updatedAt: now,
    },
    {
      id: "demo_alex_pay_rejected",
      organizationId: ORG,
      studentId: STUDENT,
      assignmentId: ASSIGN_REJECTED,
      amount: "32000.00",
      currency: "RUB",
      status: "rejected",
      provider: "stub",
      idempotencyKey: "demo-alex:pay:rejected",
      failureReason: "Демо: оплата отклонена без обращения к платёжному провайдеру",
      metadata: { demo: true },
      createdAt: addMinutes(courseStart, 4 * 24 * 60),
      updatedAt: addMinutes(courseStart, 4 * 24 * 60),
    },
  ]);

  await db.insert(t.lessonSchedules).values({
    id: DEMO_ALEX_SCHEDULE_ID,
    organizationId: ORG,
    teacherId: teacher.id,
    subject: "Физика",
    weekdays: [1, 4],
    startTime,
    durationMin: 60,
    activeFrom: courseStart,
    status: "active",
    createdAt: courseStart,
    updatedAt: now,
  });
  await db.insert(t.lessonScheduleStudents).values({
    scheduleId: DEMO_ALEX_SCHEDULE_ID,
    studentId: STUDENT,
  });

  await db.insert(t.lessons).values(
    lessons.map((lesson) => ({
      id: lesson.id,
      organizationId: ORG,
      teacherId: teacher.id,
      scheduleId: lesson.scheduleId,
      scheduleOccurrenceKey: lesson.occurrenceKey,
      subject: lesson.topic,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      status:
        lesson.kind === "cancelled"
          ? ("cancelled" as const)
          : lesson.kind === "upcoming" || lesson.kind === "unmarked"
            ? ("planned" as const)
            : ("done" as const),
      createdAt: lesson.startsAt,
      updatedAt: lesson.endsAt,
    }))
  );
  await db.insert(t.lessonStudents).values(
    lessons.map((lesson) => ({ lessonId: lesson.id, studentId: STUDENT }))
  );
  await db.insert(t.lessonTopics).values(
    lessons.map((lesson) => ({
      id: `demo_alex_lt_${lesson.id.slice("demo_alex_les_".length)}`,
      organizationId: ORG,
      lessonId: lesson.id,
      title: lesson.topic,
      sortOrder: 0,
      createdAt: lesson.startsAt,
      updatedAt: lesson.startsAt,
    }))
  );
  const marked = lessons.filter(
    (lesson) =>
      lesson.kind === "present" ||
      lesson.kind === "excused" ||
      lesson.kind === "unexcused" ||
      lesson.kind === "cancelled"
  );
  await db.insert(t.attendances).values(
    marked.map((lesson) => ({
      lessonId: lesson.id,
      studentId: STUDENT,
      status:
        lesson.kind === "present"
          ? ("present" as const)
          : lesson.kind === "excused"
            ? ("absent_excused" as const)
            : lesson.kind === "unexcused"
              ? ("absent_unexcused" as const)
              : ("cancelled" as const),
      updatedAt: lesson.endsAt,
    }))
  );

  await db.insert(t.lessonRatings).values(
    ratedLessons.map((lesson, index) => {
      const score = DEMO_ALEX_RATING_SCORES[index]!;
      return {
        id: `demo_alex_rating_${String(index + 1).padStart(2, "0")}`,
        organizationId: ORG,
        lessonId: lesson.id,
        studentId: STUDENT,
        teacherId: teacher.id,
        score,
        comment: ratingComment(score, lesson.topic),
        submittedAt: addMinutes(lesson.endsAt, 30),
        createdAt: addMinutes(lesson.endsAt, 30),
        updatedAt: addMinutes(lesson.endsAt, 30),
      };
    })
  );

  await db.insert(t.tariffLessonLedger).values(
    debitLessons.map((lesson, index) => ({
      id: `demo_alex_led_${String(index + 1).padStart(2, "0")}`,
      organizationId: ORG,
      assignmentId: index < tariff.previousUsed ? ASSIGN_PREV : ASSIGN_CUR,
      lessonId: lesson.id,
      studentId: STUDENT,
      delta: -1,
      reason: lesson.kind === "unexcused" ? ("absent_unexcused" as const) : ("present" as const),
      attendanceStatus: lesson.kind === "unexcused" ? "absent_unexcused" : "present",
      actorUserId: teacher.userId,
      createdAt: lesson.endsAt,
    }))
  );
  await db.insert(t.tariffLessonDebitState).values(
    debitLessons.map((lesson, index) => ({
      lessonId: lesson.id,
      studentId: STUDENT,
      assignmentId: index < tariff.previousUsed ? ASSIGN_PREV : ASSIGN_CUR,
      ledgerEntryId: `demo_alex_led_${String(index + 1).padStart(2, "0")}`,
      updatedAt: lesson.endsAt,
    }))
  );

  const pastByIndex = new Map(slots.past.map((key, index) => [index, lessons[index]!]));
  for (const item of HOMEWORK_BLUEPRINT) {
    const lesson = pastByIndex.get(item.pastIndex);
    if (!lesson || lesson.kind !== "present") {
      throw new Error(`Домашнее задание ${item.id} указывает не на посещённое занятие.`);
    }
    await insertHomework(db, {
      item,
      lesson,
      teacherId: teacher.id,
      teacherUserId: teacher.userId!,
      now,
    });
  }

  await insertTheory(db, {
    teacherId: teacher.id,
    teacherUserId: teacher.userId!,
    now,
  });
  await insertFormula(db, now);
  await insertCalls(db, teacher.id, lessons.filter((lesson) => lesson.kind === "present"), now);
  await insertChat(db, teacher.id, teacher.userId!, lessons, now);
  await insertNotes(db, now);

  const after = await fingerprint(db);
  if (after !== before) {
    throw new Error("Отказ: изменились данные других учеников. Проверьте seed и остановитесь.");
  }

  const stats = await verifyDemoStudent(db, teacher.id, tariff);
  return stats;
}

async function insertHomework(
  db: AppDb,
  input: {
    item: HomeworkBlueprint;
    lesson: BuiltLesson;
    teacherId: string;
    teacherUserId: string;
    now: Date;
  }
) {
  const { item, lesson } = input;
  const questions = questionsFor(lesson.topic, item.variant);
  const maxScore = questions.reduce((sum, question) => sum + question.maxScore, 0);
  const parts = questions.map((question) => splitQuestion(question));
  const title =
    item.pastIndex === 25
      ? `${lesson.topic}. ${homeworkLabel(item)}`
      : `${lesson.topic}. Домашняя работа`;
  const description = `Задачи по теме «${lesson.topic}» после занятия.`;
  const testId = `demo_alex_test_${item.id.slice("demo_alex_".length)}`;
  const assignedAt = addMinutes(lesson.startsAt, 20 + Number(item.id.slice(-2)));
  const dueAt = item.overdue
    ? addMinutes(lesson.startsAt, 2 * 24 * 60)
    : addMinutes(input.now, 5 * 24 * 60);
  await db.insert(t.tests).values({
    id: testId,
    organizationId: ORG,
    teacherId: input.teacherId,
    libraryScope: "teacher",
    title,
    description,
    status: "published",
    purpose: "homework",
    maxScore: money(maxScore),
    questionsPublic: parts.map((part) => part.publicQuestion),
    createdAt: assignedAt,
    updatedAt: assignedAt,
  });
  await db.insert(t.testAnswerKeys).values(
    parts
      .filter((part) => part.answerKey)
      .map((part) => ({
        id: `demo_alex_key_${item.id}_${part.publicQuestion.id}`,
        testId,
        questionId: part.publicQuestion.id,
        payload: part.answerKey as Record<string, unknown>,
        createdAt: assignedAt,
        updatedAt: assignedAt,
      }))
  );

  const raw = answersFor(questions, item.pattern);
  const firstGraded = gradeSubmission(questions, raw.first).answers.filter((answer) =>
    raw.first.some((itemAnswer) => itemAnswer.questionId === answer.questionId)
  );
  const secondGraded = raw.second.length
    ? gradeSubmission(questions, raw.second).answers.filter((answer) =>
        raw.second.some((itemAnswer) => itemAnswer.questionId === answer.questionId)
      )
    : [];
  const summary = summarizeAttempts(
    questions,
    item.status === "assigned" || item.status === "in_progress" ? [] : firstGraded,
    item.status === "reviewed" || item.status === "completed" ? secondGraded : [],
    item.status === "reviewed" || item.status === "completed"
      ? raw.second.length > 0
      : false
  );
  const final = computeFinalScore(questions, [
    ...firstGraded.filter((answer) => !secondGraded.some((next) => next.questionId === answer.questionId)),
    ...secondGraded,
  ]);
  const firstSubmitted = item.status !== "assigned" && item.status !== "in_progress";
  const secondSubmitted = item.pattern === "second-fix";

  await db.insert(t.testAssignments).values({
    id: item.id,
    organizationId: ORG,
    testId,
    teacherId: input.teacherId,
    studentId: STUDENT,
    lessonId: lesson.id,
    dueAt,
    sourceKind: "homework",
    status: item.status,
    attempt1Percent: firstSubmitted ? num(summary.attempt1Percent) : null,
    attempt2Percent: secondSubmitted ? num(summary.attempt2Percent) : null,
    score:
      item.status === "reviewed" || (item.status === "completed" && final.score != null)
        ? num(final.score)
        : null,
    maxScore: money(maxScore),
    feedback:
      item.status === "reviewed"
        ? item.pattern === "perfect" || item.pattern === "essay-reviewed"
          ? "Работа принята. Ход решения читается, можно переходить к следующей теме."
          : "Часть задач принята. Ошибки разобрали, на следующем занятии вернёмся к ним коротко."
        : item.status === "completed"
          ? "Развёрнутый ответ жду на проверке."
          : null,
    completedAt:
      item.status === "reviewed" || item.status === "completed" ? addMinutes(assignedAt, 2 * 24 * 60) : null,
    reviewedAt: item.status === "reviewed" ? addMinutes(assignedAt, 3 * 24 * 60) : null,
    createdAt: assignedAt,
    updatedAt: item.status === "reviewed" ? addMinutes(assignedAt, 3 * 24 * 60) : assignedAt,
  });
  await db.insert(t.assignmentSnapshots).values({
    assignmentId: item.id,
    title,
    description,
    questions: parts.map((part) => part.publicQuestion),
    maxScore: money(maxScore),
    answerKeys: Object.fromEntries(
      parts
        .filter((part) => part.answerKey)
        .map((part) => [part.publicQuestion.id, part.answerKey])
    ),
    createdAt: assignedAt,
  });

  if (item.status === "assigned") return;

  const attempt1Id = `${item.id}_a1`;
  await db.insert(t.testAttempts).values({
    id: attempt1Id,
    assignmentId: item.id,
    attemptNumber: 1,
    status: firstSubmitted ? "submitted" : "in_progress",
    score: firstSubmitted ? num(gradeSubmission(questions, firstGraded).autoScore) : null,
    maxScore: money(maxScore),
    submittedAt: firstSubmitted ? addMinutes(assignedAt, 36 * 60) : null,
    createdAt: addMinutes(assignedAt, 60),
    updatedAt: addMinutes(assignedAt, 36 * 60),
  });
  if (firstGraded.length) {
    await db.insert(t.attemptAnswers).values(
      firstGraded.map((answer) => ({
        id: `${attempt1Id}_${answer.questionId}`,
        attemptId: attempt1Id,
        questionId: answer.questionId,
        payload: payloadOf(answer),
        autoScore: answer.autoScore == null ? null : money(answer.autoScore),
        manualScore: answer.manualScore == null ? null : money(answer.manualScore),
        needsManualReview: Boolean(answer.needsManualReview),
        isCorrect: answer.isCorrect ?? null,
        teacherComment: answer.teacherComment ?? null,
        createdAt: addMinutes(assignedAt, 60),
        updatedAt: addMinutes(assignedAt, 36 * 60),
      }))
    );
  }
  if (raw.second.length || item.status === "attempt2_in_progress") {
    const attempt2Id = `${item.id}_a2`;
    await db.insert(t.testAttempts).values({
      id: attempt2Id,
      assignmentId: item.id,
      attemptNumber: 2,
      status: secondSubmitted ? "submitted" : "in_progress",
      score: secondSubmitted ? num(gradeSubmission(questions, secondGraded).autoScore) : null,
      maxScore: money(maxScore),
      submittedAt: secondSubmitted ? addMinutes(assignedAt, 48 * 60) : null,
      createdAt: addMinutes(assignedAt, 40 * 60),
      updatedAt: addMinutes(assignedAt, 48 * 60),
    });
    if (secondGraded.length) {
      await db.insert(t.attemptAnswers).values(
        secondGraded.map((answer) => ({
          id: `${attempt2Id}_${answer.questionId}`,
          attemptId: attempt2Id,
          questionId: answer.questionId,
          payload: payloadOf(answer),
          autoScore: answer.autoScore == null ? null : money(answer.autoScore),
          manualScore: answer.manualScore == null ? null : money(answer.manualScore),
          needsManualReview: Boolean(answer.needsManualReview),
          isCorrect: answer.isCorrect ?? null,
          teacherComment: answer.teacherComment ?? null,
          createdAt: addMinutes(assignedAt, 40 * 60),
          updatedAt: addMinutes(assignedAt, 48 * 60),
        }))
      );
    }
  }

  if (item.status === "reviewed") {
    await db.insert(t.gradeEvents).values([
      {
        id: `${item.id}_ev_assigned`,
        organizationId: ORG,
        assignmentId: item.id,
        eventType: "assigned",
        actorUserId: input.teacherUserId,
        payload: { title },
        createdAt: assignedAt,
      },
      {
        id: `${item.id}_ev_submitted`,
        organizationId: ORG,
        assignmentId: item.id,
        eventType: "submitted",
        actorUserId: USER,
        payload: { attempt: raw.second.length ? 2 : 1 },
        createdAt: addMinutes(assignedAt, 36 * 60),
      },
      {
        id: `${item.id}_ev_reviewed`,
        organizationId: ORG,
        assignmentId: item.id,
        eventType: "reviewed",
        actorUserId: input.teacherUserId,
        payload: { title },
        createdAt: addMinutes(assignedAt, 3 * 24 * 60),
      },
    ]);
  }
}

function homeworkLabel(item: HomeworkBlueprint): string {
  switch (item.status) {
    case "assigned":
      return item.id.endsWith("16") ? "Новое задание" : "Дополнительные задачи";
    case "in_progress":
      return "Черновик";
    case "attempt1_submitted":
      return "На доработке";
    case "attempt2_in_progress":
      return "Вторая попытка";
    case "remaining_questions":
      return "Остались вопросы";
    case "completed":
      return "Ждёт проверки";
    default:
      return "Домашняя работа";
  }
}

type TheorySpec = {
  n: string;
  title: string;
  description: string;
  video?: string;
  files: Array<"pdf" | "docx" | "doc">;
  status: "assigned" | "viewed" | "in_progress" | "awaiting_review" | "completed";
  test?: "ready" | "draft" | "pending" | "passed";
  ageDays: number;
};

const THEORY: TheorySpec[] = [
  {
    n: "01",
    title: "Кинематика: равномерное и равноускоренное движение",
    description: "Видео, короткий тест и PDF-конспект. Тест откроется после просмотра.",
    video: VIDEOS.kinematics,
    files: ["pdf"],
    status: "assigned",
    test: "ready",
    ageDays: 2,
  },
  {
    n: "02",
    title: "Динамика и законы Ньютона",
    description: "Видео уже отмечено просмотренным, мини-тест можно начинать.",
    video: VIDEOS.newton,
    files: [],
    status: "viewed",
    test: "ready",
    ageDays: 20,
  },
  {
    n: "03",
    title: "Силы и проекции",
    description: "Видео и конспект DOCX. Тест начат, ответы ещё в черновике.",
    video: VIDEOS.newton,
    files: ["docx"],
    status: "in_progress",
    test: "draft",
    ageDays: 40,
  },
  {
    n: "04",
    title: "Работа, мощность и энергия",
    description: "Без видео: PDF и тест. Первая попытка сдана не полностью.",
    files: ["pdf"],
    status: "in_progress",
    test: "draft",
    ageDays: 55,
  },
  {
    n: "05",
    title: "Импульс и сохранения",
    description: "Видео, тест и PDF. Тест сдан и ждёт проверки развёрнутого ответа.",
    video: VIDEOS.impulse,
    files: ["pdf"],
    status: "awaiting_review",
    test: "pending",
    ageDays: 30,
  },
  {
    n: "06",
    title: "Столкновения",
    description: "Видео просмотрено, мини-тест пройден.",
    video: VIDEOS.impulse,
    files: ["pdf"],
    status: "completed",
    test: "passed",
    ageDays: 48,
  },
  {
    n: "07",
    title: "Молекулярная физика: конспект",
    description: "Только PDF. Материал уже открыт и засчитан без теста.",
    files: ["pdf"],
    status: "completed",
    ageDays: 36,
  },
  {
    n: "08",
    title: "Термодинамика: первое начало",
    description: "Новое видео и конспект DOC. Теста нет, просмотр ещё не отмечен.",
    video: VIDEOS.thermo,
    files: ["doc"],
    status: "assigned",
    ageDays: 1,
  },
  {
    n: "09",
    title: "Электрическое поле",
    description: "Тест и PDF без видео. Назначение новое, тест ещё не начат.",
    files: ["pdf"],
    status: "assigned",
    test: "ready",
    ageDays: 0,
  },
  {
    n: "10",
    title: "Постоянный ток",
    description: "Видео разобрано, к нему приложен конспект DOCX. Отдельного теста нет.",
    video: VIDEOS.current,
    files: ["docx"],
    status: "completed",
    ageDays: 12,
  },
];

async function insertTheory(
  db: AppDb,
  input: {
    teacherId: string;
    teacherUserId: string;
    now: Date;
  }
) {
  for (const spec of THEORY) {
    const materialId = `demo_alex_th_${spec.n}`;
    const versionId = `demo_alex_thv_${spec.n}`;
    const assignedAt = addMinutes(input.now, -spec.ageDays * 24 * 60);
    const video = spec.video ? videoOf(spec.video) : null;
    let testId: string | null = null;
    if (spec.test) {
      const theoryTestId = `demo_alex_test_th_${spec.n}`;
      testId = theoryTestId;
      const questions = questionsFor(spec.title, spec.n === "05" || spec.n === "04" ? 1 : 0);
      const parts = questions.map((question) => splitQuestion(question));
      const maxScore = questions.reduce((sum, question) => sum + question.maxScore, 0);
      await db.insert(t.tests).values({
        id: theoryTestId,
        organizationId: ORG,
        teacherId: input.teacherId,
        libraryScope: "teacher",
        title: `Мини-тест. ${spec.title}`,
        description: "Короткий тест к теоретическому материалу.",
        status: "published",
        purpose: "theory",
        maxScore: money(maxScore),
        questionsPublic: parts.map((part) => part.publicQuestion),
        createdAt: assignedAt,
        updatedAt: assignedAt,
      });
      const keys = parts.filter((part) => part.answerKey);
      if (keys.length) {
        await db.insert(t.testAnswerKeys).values(
          keys.map((part) => ({
            id: `demo_alex_key_th_${spec.n}_${part.publicQuestion.id}`,
            testId: theoryTestId,
            questionId: part.publicQuestion.id,
            payload: part.answerKey as Record<string, unknown>,
            createdAt: assignedAt,
            updatedAt: assignedAt,
          }))
        );
      }
      const openTest = spec.status !== "assigned" || !spec.video;
      if (openTest && spec.test) {
        const pattern: HomeworkPattern =
          spec.test === "passed"
            ? "perfect"
            : spec.test === "pending"
              ? "essay-pending"
              : spec.test === "draft"
                ? "draft"
                : "perfect";
        const status =
          spec.test === "passed"
            ? "reviewed"
            : spec.test === "pending"
              ? "completed"
              : spec.test === "draft"
                ? "in_progress"
                : "assigned";
        if (status !== "assigned") {
          await insertTheoryAttempt(db, {
            assignmentId: `demo_alex_tt_${spec.n}`,
            testId: theoryTestId,
            questions,
            pattern,
            status,
            teacherId: input.teacherId,
            teacherUserId: input.teacherUserId,
            assignedAt,
            title: `Мини-тест. ${spec.title}`,
          });
        } else {
          await db.insert(t.testAssignments).values({
            id: `demo_alex_tt_${spec.n}`,
            organizationId: ORG,
            testId: theoryTestId,
            teacherId: input.teacherId,
            studentId: STUDENT,
            sourceKind: "theory",
            status: "assigned",
            maxScore: money(maxScore),
            createdAt: assignedAt,
            updatedAt: assignedAt,
          });
          await db.insert(t.assignmentSnapshots).values({
            assignmentId: `demo_alex_tt_${spec.n}`,
            title: `Мини-тест. ${spec.title}`,
            description: "Короткий тест к теоретическому материалу.",
            questions: parts.map((part) => part.publicQuestion),
            maxScore: money(maxScore),
            answerKeys: Object.fromEntries(
              parts.filter((part) => part.answerKey).map((part) => [part.publicQuestion.id, part.answerKey])
            ),
            createdAt: assignedAt,
          });
        }
      }
    }

    const viewed = spec.status !== "assigned";
    const testAssignmentId =
      spec.test && (spec.status !== "assigned" || !spec.video) ? `demo_alex_tt_${spec.n}` : null;
    await db.insert(t.theoryMaterials).values({
      id: materialId,
      organizationId: ORG,
      teacherId: input.teacherId,
      libraryScope: "teacher",
      title: spec.title,
      description: spec.description,
      videoUrl: video?.watchUrl ?? null,
      videoProvider: video?.provider ?? null,
      videoEmbedUrl: video?.embedUrl ?? null,
      embedAllowed: video?.embedAllowed ?? false,
      videoWarning: video && "warning" in video ? video.warning ?? null : null,
      status: "published",
      testId,
      currentVersionId: versionId,
      createdAt: assignedAt,
      updatedAt: assignedAt,
    });
    await db.insert(t.theoryMaterialVersions).values({
      id: versionId,
      materialId,
      title: spec.title,
      description: spec.description,
      videoUrl: video?.watchUrl ?? null,
      videoProvider: video?.provider ?? null,
      videoEmbedUrl: video?.embedUrl ?? null,
      embedAllowed: video?.embedAllowed ?? false,
      videoWarning: video && "warning" in video ? video.warning ?? null : null,
      testId,
      publishedAt: assignedAt,
      createdAt: assignedAt,
    });

    for (const [fileIndex, kind] of spec.files.entries()) {
      const file = fileBytes(kind, spec.title);
      sniffTheoryFile(file.bytes, file.filename);
      const key = `theory/${ORG}/${materialId}/conspect-${fileIndex}${kind === "pdf" ? ".pdf" : kind === "doc" ? ".doc" : ".docx"}`;
      await putTheoryObject(key, file.bytes, file.mime);
      const row = {
        organizationId: ORG,
        materialId,
        objectKey: key,
        originalName: file.filename,
        mimeType: file.mime,
        sizeBytes: file.bytes.length,
        createdAt: assignedAt,
      };
      await db.insert(t.theoryFiles).values([
        { ...row, id: `demo_alex_file_${spec.n}_${fileIndex}_draft`, versionId: null },
        { ...row, id: `demo_alex_file_${spec.n}_${fileIndex}`, versionId },
      ]);
    }

    await db.insert(t.theoryAssignments).values({
      id: `demo_alex_ta_${spec.n}`,
      organizationId: ORG,
      materialId,
      versionId,
      teacherId: input.teacherId,
      studentId: STUDENT,
      assignedByUserId: input.teacherUserId,
      status: spec.status,
      viewedAt: viewed ? addMinutes(assignedAt, 60) : null,
      completedAt: spec.status === "completed" ? addMinutes(assignedAt, 2 * 24 * 60) : null,
      testAssignmentId,
      createdAt: assignedAt,
      updatedAt: viewed ? addMinutes(assignedAt, 60) : assignedAt,
    });
  }
}

async function insertTheoryAttempt(
  db: AppDb,
  input: {
    assignmentId: string;
    testId: string;
    questions: TestQuestion[];
    pattern: HomeworkPattern;
    status: "in_progress" | "completed" | "reviewed" | "assigned";
    teacherId: string;
    teacherUserId: string;
    assignedAt: Date;
    title: string;
  }
) {
  const parts = input.questions.map((question) => splitQuestion(question));
  const maxScore = input.questions.reduce((sum, question) => sum + question.maxScore, 0);
  const raw = answersFor(input.questions, input.pattern);
  const graded = gradeSubmission(input.questions, raw.first).answers.filter((answer) =>
    raw.first.some((item) => item.questionId === answer.questionId)
  );
  const summary = summarizeAttempts(
    input.questions,
    input.status === "in_progress" ? [] : graded,
    [],
    false
  );
  const final = computeFinalScore(input.questions, graded);
  await db.insert(t.testAssignments).values({
    id: input.assignmentId,
    organizationId: ORG,
    testId: input.testId,
    teacherId: input.teacherId,
    studentId: STUDENT,
    sourceKind: "theory",
    status: input.status,
    attempt1Percent: input.status === "in_progress" ? null : num(summary.attempt1Percent),
    score: input.status === "reviewed" ? num(final.score) : null,
    maxScore: money(maxScore),
    feedback: input.status === "reviewed" ? "Мини-тест зачтён." : null,
    completedAt: input.status === "reviewed" || input.status === "completed" ? addMinutes(input.assignedAt, 26 * 60) : null,
    reviewedAt: input.status === "reviewed" ? addMinutes(input.assignedAt, 30 * 60) : null,
    createdAt: input.assignedAt,
    updatedAt: input.assignedAt,
  });
  await db.insert(t.assignmentSnapshots).values({
    assignmentId: input.assignmentId,
    title: input.title,
    description: "Короткий тест к теоретическому материалу.",
    questions: parts.map((part) => part.publicQuestion),
    maxScore: money(maxScore),
    answerKeys: Object.fromEntries(
      parts.filter((part) => part.answerKey).map((part) => [part.publicQuestion.id, part.answerKey])
    ),
    createdAt: input.assignedAt,
  });
  if (input.status === "assigned") return;
  const attemptId = `${input.assignmentId}_a1`;
  await db.insert(t.testAttempts).values({
    id: attemptId,
    assignmentId: input.assignmentId,
    attemptNumber: 1,
    status: input.status === "in_progress" ? "in_progress" : "submitted",
    score: input.status === "in_progress" ? null : num(gradeSubmission(input.questions, graded).autoScore),
    maxScore: money(maxScore),
    submittedAt: input.status === "in_progress" ? null : addMinutes(input.assignedAt, 24 * 60),
    createdAt: input.assignedAt,
    updatedAt: input.assignedAt,
  });
  if (graded.length) {
    await db.insert(t.attemptAnswers).values(
      graded.map((answer) => ({
        id: `${attemptId}_${answer.questionId}`,
        attemptId,
        questionId: answer.questionId,
        payload: payloadOf(answer),
        autoScore: answer.autoScore == null ? null : money(answer.autoScore),
        manualScore: answer.manualScore == null ? null : money(answer.manualScore),
        needsManualReview: Boolean(answer.needsManualReview),
        isCorrect: answer.isCorrect ?? null,
        teacherComment: answer.teacherComment ?? null,
        createdAt: input.assignedAt,
        updatedAt: input.assignedAt,
      }))
    );
  }
}

async function insertFormula(db: AppDb, now: Date) {
  const mastered = [
    "mech_kin_s_vt",
    "mech_kin_v_st",
    "mech_kin_x_uniform",
    "mech_kin_a_def",
    "mech_kin_s_accel",
    "mech_kin_x_accel",
    "mech_kin_s_no_t",
    "mech_cons_p_mv",
    "mech_cons_Ek",
    "mol_mkt_n_NV",
    "th_heat_Q_c",
    "cur_dc_ohm_I",
  ];
  const weak = [
    { id: "mech_dyn_FR_ma", attempts: 4, correct: 1 },
    { id: "mech_dyn_Ftr", attempts: 3, correct: 1 },
    { id: "mech_dyn_Fupr", attempts: 5, correct: 2 },
    { id: "th_thermo_first", attempts: 4, correct: 1 },
    { id: "el_es_U_Ed", attempts: 3, correct: 1 },
    { id: "cur_dc_ohm_U", attempts: 4, correct: 2 },
  ];
  await db.insert(t.formulaTrainerSettings).values({
    studentId: STUDENT,
    organizationId: ORG,
    mode: "choice",
    selectedSubsections: [
      "kinematics",
      "dynamics",
      "conservation",
      "mkt",
      "heat",
      "thermo",
      "electrostatics",
      "dc",
    ],
    weakSpotsOnly: false,
    quickQuestion: null,
    recentFormulaIds: ["mech_dyn_FR_ma", "cur_dc_ohm_U", "th_thermo_first", "mech_kin_s_vt"],
    createdAt: addMinutes(now, -40 * 24 * 60),
    updatedAt: now,
  });
  await db.insert(t.formulaTrainerProgress).values([
    ...mastered.map((formulaId, index) => ({
      id: `demo_alex_fp_${String(index + 1).padStart(2, "0")}`,
      organizationId: ORG,
      studentId: STUDENT,
      formulaId,
      attempts: 3,
      correctCount: 3,
      wrongCount: 0,
      status: "mastered" as const,
      streak: 3,
      lastAttemptAt: addMinutes(now, -(index + 1) * 24 * 60),
      nextReviewAt: addMinutes(now, 7 * 24 * 60),
      createdAt: addMinutes(now, -50 * 24 * 60),
      updatedAt: now,
    })),
    ...weak.map((row, index) => ({
      id: `demo_alex_fp_w${index + 1}`,
      organizationId: ORG,
      studentId: STUDENT,
      formulaId: row.id,
      attempts: row.attempts,
      correctCount: row.correct,
      wrongCount: row.attempts - row.correct,
      status: "needs_review" as const,
      streak: 0,
      lastAttemptAt: addMinutes(now, -(index + 1) * 12 * 60),
      nextReviewAt: addMinutes(now, -60),
      createdAt: addMinutes(now, -30 * 24 * 60),
      updatedAt: now,
    })),
    {
      id: "demo_alex_fp_once",
      organizationId: ORG,
      studentId: STUDENT,
      formulaId: "mech_cons_Ep",
      attempts: 1,
      correctCount: 1,
      wrongCount: 0,
      status: "needs_review" as const,
      streak: 1,
      lastAttemptAt: addMinutes(now, -6 * 24 * 60),
      nextReviewAt: addMinutes(now, 24 * 60),
      createdAt: addMinutes(now, -6 * 24 * 60),
      updatedAt: now,
    },
  ]);

  const history = [
    { formulaId: "mech_kin_s_vt", ok: true, days: 40 },
    { formulaId: "mech_kin_v_st", ok: true, days: 38 },
    { formulaId: "mech_dyn_FR_ma", ok: false, days: 21 },
    { formulaId: "mech_dyn_FR_ma", ok: false, days: 14 },
    { formulaId: "mech_dyn_Ftr", ok: true, days: 13 },
    { formulaId: "th_thermo_first", ok: false, days: 9 },
    { formulaId: "cur_dc_ohm_I", ok: true, days: 7 },
    { formulaId: "el_es_U_Ed", ok: false, days: 3 },
  ];
  await db.insert(t.formulaTrainerQuestions).values(
    history.map((row, index) => ({
      id: `demo_alex_fq_${String(index + 1).padStart(2, "0")}`,
      organizationId: ORG,
      studentId: STUDENT,
      formulaId: row.formulaId,
      kind: "choice" as const,
      options: [
        { id: "opt_ok", expression: "верная форма" },
        { id: "opt_bad", expression: "частая ошибка" },
      ],
      correctOptionId: "opt_ok",
      source: "trainer" as const,
      answeredAt: addMinutes(now, -row.days * 24 * 60),
      isCorrect: row.ok,
      selectedOptionId: row.ok ? "opt_ok" : "opt_bad",
      studentAnswer: null,
      explanation: row.ok ? "Совпало с формулой каталога." : "Выбрана похожая, но не эквивалентная запись.",
      createdAt: addMinutes(now, -row.days * 24 * 60),
      updatedAt: addMinutes(now, -row.days * 24 * 60),
    }))
  );
}

async function insertCalls(
  db: AppDb,
  teacherId: string,
  present: BuiltLesson[],
  now: Date
) {
  const durations = [58, 47, 62, 15, 5, 51, 44, 60, 33, 49, 55, 28];
  const picked = present.filter((_, index) => index % 2 === 0).slice(0, durations.length);
  while (picked.length < durations.length) picked.push(present[present.length - 1]!);
  await db.insert(t.videoCalls).values(
    durations.map((minutes, index) => {
      const start = addMinutes(picked[index]!.startsAt, 2);
      return {
        id: `demo_alex_vc_${String(index + 1).padStart(2, "0")}`,
        organizationId: ORG,
        teacherId,
        mode: index === 3 ? ("group" as const) : ("parallel" as const),
        status: "ended" as const,
        activeParticipantId: null,
        endedAt: addMinutes(start, minutes),
        createdAt: start,
        updatedAt: addMinutes(start, minutes),
      };
    })
  );
  await db.insert(t.videoCallParticipants).values(
    durations.map((minutes, index) => {
      const start = addMinutes(picked[index]!.startsAt, 2);
      return {
        id: `demo_alex_vcp_${String(index + 1).padStart(2, "0")}`,
        organizationId: ORG,
        callId: `demo_alex_vc_${String(index + 1).padStart(2, "0")}`,
        studentId: STUDENT,
        livekitRoomName: `history-demo-alex-${String(index + 1).padStart(2, "0")}`,
        status: "closed" as const,
        closedAt: addMinutes(start, minutes),
        createdAt: start,
        updatedAt: addMinutes(start, minutes),
      };
    })
  );
  void now;
}

async function insertChat(
  db: AppDb,
  teacherId: string,
  teacherUserId: string,
  lessons: BuiltLesson[],
  now: Date
) {
  const first = lessons[0]!;
  const mid = lessons[Math.min(12, lessons.length - 1)]!;
  await db.insert(t.chats).values({
    id: DEMO_ALEX_CHAT_ID,
    organizationId: ORG,
    studentId: STUDENT,
    teacherId,
    lastMessageAt: addMinutes(now, -18 * 60),
    createdAt: first.startsAt,
    updatedAt: now,
  });
  const messages: { id: string; author: string; body: string; at: Date }[] = [
    {
      id: "demo_alex_msg_01",
      author: teacherUserId,
      body: "Александр, добрый день. На ближайших занятиях идём по механике: кинематика, потом законы Ньютона. Если что-то из школьного курса уже знакомо, напишите.",
      at: addMinutes(first.startsAt, -24 * 60),
    },
    {
      id: "demo_alex_msg_02",
      author: USER,
      body: "Здравствуйте. С графиком скорости пока путаюсь, особенно когда ускорение отрицательное. На занятии лучше разобрать это на числах.",
      at: addMinutes(first.startsAt, -20 * 60),
    },
    {
      id: "demo_alex_msg_03",
      author: teacherUserId,
      body: "Договорились. Возьмём задачу с торможением и отдельно выпишем знаки проекций.",
      at: addMinutes(first.endsAt, 30),
    },
    {
      id: "demo_alex_msg_04",
      author: USER,
      body: "В домашней работе по энергии числовой ответ сошёлся не сразу. Во второй попытке поправил работу силы. Посмотрите, пожалуйста, когда будет время.",
      at: addMinutes(mid.startsAt, 80),
    },
    {
      id: "demo_alex_msg_05",
      author: teacherUserId,
      body: "Посмотрел. Ход уже верный, в комментарии к задаче оставил, где потерялся знак. К току перейдём после термодинамики.",
      at: addMinutes(mid.startsAt, 26 * 60),
    },
    {
      id: "demo_alex_msg_06",
      author: USER,
      body: "Спасибо. К следующему занятию выпишу вопросы по закону Ома, чтобы не держать их в голове.",
      at: addMinutes(now, -18 * 60),
    },
  ];
  await db.insert(t.chatMessages).values(
    messages.map((message) => ({
      id: message.id,
      chatId: DEMO_ALEX_CHAT_ID,
      organizationId: ORG,
      type: "user_message" as const,
      authorUserId: message.author,
      body: message.body,
      createdAt: message.at,
    }))
  );
  await db.insert(t.chatReadCursors).values([
    {
      chatId: DEMO_ALEX_CHAT_ID,
      userId: USER,
      lastReadAt: messages[4]!.at,
      lastReadMessageId: messages[4]!.id,
      updatedAt: messages[4]!.at,
    },
    {
      chatId: DEMO_ALEX_CHAT_ID,
      userId: teacherUserId,
      lastReadAt: messages[5]!.at,
      lastReadMessageId: messages[5]!.id,
      updatedAt: messages[5]!.at,
    },
  ]);
}

async function insertNotes(db: AppDb, now: Date) {
  await db.insert(t.userNotes).values([
    {
      id: "demo_alex_note_01",
      organizationId: ORG,
      userId: USER,
      title: "Знаки проекций",
      content: "Если тело тормозит, проекция ускорения против скорости. Не путать с направлением силы трения на рисунке.",
      createdAt: addMinutes(now, -20 * 24 * 60),
      updatedAt: addMinutes(now, -4 * 24 * 60),
    },
    {
      id: "demo_alex_note_02",
      organizationId: ORG,
      userId: USER,
      title: "К занятию по току",
      content: "Спросить про внутреннее сопротивление и почему вольтметр подключают параллельно. Повторить I = U/R.",
      createdAt: addMinutes(now, -2 * 24 * 60),
      updatedAt: addMinutes(now, -2 * 24 * 60),
    },
  ]);
}

async function verifyDemoStudent(
  db: AppDb,
  teacherId: string,
  tariff: ReturnType<typeof splitTariffDebits>
): Promise<DemoStudentSeedStats> {
  const teacher = await db
    .select({ fullName: t.teachers.fullName })
    .from(t.teachers)
    .where(eq(t.teachers.id, teacherId))
    .limit(1);
  const ctx: AuthContext = {
    userId: USER,
    email: DEMO_ALEX_EMAIL,
    fullName: DEMO_ALEX_FULL_NAME,
    organizationId: ORG,
    role: "student",
    teacherId: null,
    studentId: STUDENT,
    sessionId: "demo-alex-verify",
    impersonation: null,
  };
  const data = await buildBootstrap(db, ctx);
  const lessons = data.lessons.filter((lesson) => lesson.studentIds.includes(STUDENT));
  const past = lessons.filter((lesson) => new Date(lesson.startsAt).getTime() <= Date.now());
  const upcoming = lessons.filter((lesson) => new Date(lesson.startsAt).getTime() > Date.now());
  const homework = data.homeworkAssignments.filter(
    (row) => row.studentId === STUDENT && row.sourceKind !== "theory"
  );
  const sections = { overdue: 0, new: 0, incomplete: 0, completed: 0 };
  for (const row of homework) {
    const missed = isMissedNextLesson(row, data.lessons, new Date(), data.attendances);
    sections[homeworkSectionFor({ ...row, missedNextLesson: missed })] += 1;
  }
  const theoryStatuses = new Set(data.theoryAssignments.map((row) => row.status));
  const current = data.tariffAssignments.find((row) => row.id === ASSIGN_CUR);
  const errors: string[] = [];
  if (!data.teachers.some((row) => row.id === teacherId)) errors.push("нет карточки преподавателя");
  if (!current || current.paymentStatus !== "paid" || current.status !== "active") {
    errors.push("текущий тариф не активен");
  }
  if (current && current.lessonsRemaining !== tariff.remaining) {
    errors.push(`остаток тарифа ${current.lessonsRemaining}, ожидалось ${tariff.remaining}`);
  }
  if (current && current.lessonsUsed !== tariff.currentUsed) {
    errors.push(`списано ${current.lessonsUsed}, ожидалось ${tariff.currentUsed}`);
  }
  if (past.length < 20) errors.push("мало прошедших занятий");
  if (upcoming.length < 4) errors.push("мало будущих занятий");
  if (sections.overdue < 1 || sections.new < 1 || sections.incomplete < 1 || sections.completed < 1) {
    errors.push(`секции ДЗ неполные: ${JSON.stringify(sections)}`);
  }
  for (const status of ["assigned", "viewed", "in_progress", "awaiting_review", "completed"] as const) {
    if (!theoryStatuses.has(status)) errors.push(`нет теории в статусе ${status}`);
  }
  const locked = data.theoryAssignments.find(
    (row) => row.videoUrl && !row.viewedAt && row.hasTest && !row.testAssignmentId
  );
  if (!locked) errors.push("нет теории, где тест закрыт до просмотра видео");
  const calls = await listVideoCalls(db, ctx);
  if (calls.length < 10) errors.push("мало звонков");
  if (calls.some((call) => call.status !== "ended")) errors.push("есть незакрытый звонок");
  const [foreignCall] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.videoCallParticipants)
    .where(
      and(
        sql`${t.videoCallParticipants.callId} like 'demo_alex_vc_%'`,
        ne(t.videoCallParticipants.studentId, STUDENT)
      )
    );
  if (Number(foreignCall?.n ?? 0) !== 0) errors.push("к демо-звонкам привязан другой ученик");
  const trainer = await getFormulaTrainerState(db, ctx);
  const summary = trainerHomeSummary(trainer.progress);
  if (summary.practicedCount < 8) errors.push("мало формул в тренажёре");
  if (summary.weakTopics.length < 2) errors.push("мало слабых тем тренажёра");
  if (summary.formulaCount <= summary.practicedCount) errors.push("нет непройденных формул");
  const [ratingCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessonRatings)
    .where(eq(t.lessonRatings.studentId, STUDENT));
  const [lowWithoutComment] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessonRatings)
    .where(
      and(
        eq(t.lessonRatings.studentId, STUDENT),
        sql`${t.lessonRatings.score} <= 6 and length(trim(${t.lessonRatings.comment})) = 0`
      )
    );
  if (Number(lowWithoutComment?.n ?? 0) !== 0) {
    errors.push("у низкой оценки нет комментария");
  }
  const [cancelledRated] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.lessonRatings)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonRatings.lessonId))
    .where(and(eq(t.lessonRatings.studentId, STUDENT), eq(t.lessons.status, "cancelled")));
  if (Number(cancelledRated?.n ?? 0) !== 0) errors.push("оценка стоит на отменённом занятии");
  if (errors.length) {
    throw new Error(`Проверка демо-ученика не сошлась: ${errors.join("; ")}`);
  }
  return {
    studentId: STUDENT,
    email: DEMO_ALEX_EMAIL,
    teacherId,
    teacherName: teacher[0]?.fullName ?? teacherId,
    lessons: lessons.length,
    pastLessons: past.length,
    upcomingLessons: upcoming.length,
    ratings: Number(ratingCount?.n ?? 0),
    unratedPresent: 2,
    homework: homework.length,
    theory: data.theoryAssignments.length,
    calls: calls.length,
    payments: data.payments.filter((row) => row.studentId === STUDENT).length,
    tariffRemaining: tariff.remaining,
    tariffUsed: tariff.currentUsed,
    tariffLimit: tariff.currentLimit,
  };
}
