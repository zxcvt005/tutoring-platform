import {
  addAppDateKey,
  appDateKey,
  fromAppDateOnly,
  fromAppDateTime,
} from "@/lib/app-time";
import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import {
  STUDENT_TOUR_STUDENT_ID,
  STUDENT_TOUR_TEACHER_ID,
} from "@/lib/student-tour/constants";
import type { StudentTourExtras } from "@/lib/student-tour/types";
import type {
  Attendance,
  DemoData,
  Homework,
  HomeworkAssignment,
  Intensive,
  IntensiveAssignment,
  Lesson,
  MockExam,
  MockExamResult,
  TheoryAssignment,
  TheoryMaterial,
  Topic,
  TopicSection,
} from "@/lib/types";

const T = STUDENT_TOUR_TEACHER_ID;
const S = STUDENT_TOUR_STUDENT_ID;

function atDay(offset: number, hour: number, minute = 0): string {
  const key = addAppDateKey(appDateKey(new Date()), offset);
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return fromAppDateTime(key, hm).toISOString();
}

function endAt(startIso: string, durationMin: number): string {
  return new Date(new Date(startIso).getTime() + durationMin * 60_000).toISOString();
}

function dayKey(offset: number): string {
  return addAppDateKey(appDateKey(new Date()), offset);
}

function lesson(
  id: string,
  offset: number,
  hour: number,
  status: Lesson["status"],
  title: string,
  topicId?: string
): Lesson {
  const startsAt = atDay(offset, hour, 0);
  return {
    id,
    teacherId: T,
    studentIds: [S],
    subject: "Физика",
    startsAt,
    endsAt: endAt(startsAt, 60),
    status,
    topicId,
    lessonTopics: [
      { id: `${id}_lt`, topicId: topicId ?? null, title, sortOrder: 0 },
    ],
  };
}

function hw(
  id: string,
  title: string,
  sectionId: string,
  topicId: string | null,
  questionCount: number
): Homework {
  return {
    id,
    teacherId: T,
    sectionId,
    topicId,
    title,
    description: `Демо-набор: ${questionCount} упражнений по теме «${title}».`,
    status: "published",
    questions: [],
    maxScore: questionCount,
    questionCount,
    purpose: "homework",
  };
}

function ha(input: {
  id: string;
  homeworkId: string;
  title: string;
  status: HomeworkAssignment["status"];
  assignedOffset: number;
  dueOffset: number;
  attempt1Percent?: number | null;
  attempt2Percent?: number | null;
  score?: number;
  maxScore: number;
  missedNextLesson?: boolean;
  lessonId?: string;
}): HomeworkAssignment {
  const done = input.status === "completed" || input.status === "reviewed";
  return {
    id: input.id,
    homeworkId: input.homeworkId,
    teacherId: T,
    studentId: S,
    sourceKind: "homework",
    lessonId: input.lessonId,
    assignedAt: atDay(input.assignedOffset, 12),
    dueAt: atDay(input.dueOffset, 18),
    status: input.status,
    missedNextLesson: input.missedNextLesson,
    attempt1Percent: input.attempt1Percent ?? null,
    attempt2Percent: input.attempt2Percent ?? null,
    score: input.score,
    maxScore: input.maxScore,
    completedAt: done ? atDay(input.dueOffset - 1, 20) : undefined,
    reviewedAt: input.status === "reviewed" ? atDay(input.dueOffset, 10) : undefined,
    testSnapshot: {
      title: input.title,
      description: "Демонстрационное задание без открытых вопросов и ключей.",
      questions: [],
      maxScore: input.maxScore,
    },
    revealKeys: false,
  };
}

function theoryMat(
  id: string,
  title: string,
  description: string,
  createdOffset: number,
  opts?: { hasVideo?: boolean; fileCount?: number }
): TheoryMaterial {
  const createdAt = atDay(createdOffset, 11);
  return {
    id,
    teacherId: T,
    title,
    description,
    status: "published",
    embedAllowed: false,
    hasTest: false,
    hasVideo: Boolean(opts?.hasVideo),
    fileCount: opts?.fileCount ?? 1,
    assignedCount: 1,
    completedCount: 0,
    awaitingReviewCount: 0,
    createdAt,
    updatedAt: createdAt,
    files: [
      {
        id: `${id}_f1`,
        originalName: `${title}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 420_000,
      },
    ],
  };
}

function theoryAsg(
  id: string,
  material: TheoryMaterial,
  status: TheoryAssignment["status"],
  assignedOffset: number
): TheoryAssignment {
  return {
    id,
    materialId: material.id,
    versionId: `${material.id}_v1`,
    teacherId: T,
    studentId: S,
    status,
    assignedAt: atDay(assignedOffset, 13),
    viewedAt:
      status === "assigned" ? null : atDay(assignedOffset + 1, 19),
    completedAt: status === "completed" ? atDay(assignedOffset + 3, 18) : null,
    title: material.title,
    description: material.description,
    embedAllowed: false,
    hasTest: false,
    files: material.files ?? [],
    videoUrl: material.hasVideo ? "https://example.invalid/demo" : null,
  };
}

/** Полный согласованный срез кабинета Артёма за ~4 месяца. */
export function createStudentTourSeed(): DemoData {
  const sections: TopicSection[] = [
    { id: "tour_sec_mech", teacherId: T, title: "Механика", sortOrder: 0 },
    { id: "tour_sec_mkt", teacherId: T, title: "МКТ и термодинамика", sortOrder: 1 },
    { id: "tour_sec_em", teacherId: T, title: "Электричество и магнетизм", sortOrder: 2 },
    { id: "tour_sec_opt", teacherId: T, title: "Оптика", sortOrder: 3 },
  ];

  const topics: Topic[] = [
    { id: "tour_tp_kin", teacherId: T, sectionId: "tour_sec_mech", title: "Кинематика", subject: "Физика", status: "active", sortOrder: 0 },
    { id: "tour_tp_dyn", teacherId: T, sectionId: "tour_sec_mech", title: "Динамика", subject: "Физика", status: "active", sortOrder: 1 },
    { id: "tour_tp_stat", teacherId: T, sectionId: "tour_sec_mech", title: "Статика", subject: "Физика", status: "active", sortOrder: 2 },
    { id: "tour_tp_cons", teacherId: T, sectionId: "tour_sec_mech", title: "Законы сохранения", subject: "Физика", status: "active", sortOrder: 3 },
    { id: "tour_tp_osc", teacherId: T, sectionId: "tour_sec_mech", title: "Колебания и волны", subject: "Физика", status: "active", sortOrder: 4 },
    { id: "tour_tp_mkt", teacherId: T, sectionId: "tour_sec_mkt", title: "МКТ", subject: "Физика", status: "active", sortOrder: 0 },
    { id: "tour_tp_thermo", teacherId: T, sectionId: "tour_sec_mkt", title: "Термодинамика", subject: "Физика", status: "active", sortOrder: 1 },
    { id: "tour_tp_elstat", teacherId: T, sectionId: "tour_sec_em", title: "Электростатика", subject: "Физика", status: "active", sortOrder: 0 },
    { id: "tour_tp_dc", teacherId: T, sectionId: "tour_sec_em", title: "Постоянный ток", subject: "Физика", status: "active", sortOrder: 1 },
    { id: "tour_tp_mag", teacherId: T, sectionId: "tour_sec_em", title: "Магнитное поле", subject: "Физика", status: "active", sortOrder: 2 },
    { id: "tour_tp_ind", teacherId: T, sectionId: "tour_sec_em", title: "Электромагнитная индукция", subject: "Физика", status: "active", sortOrder: 3 },
    { id: "tour_tp_lens", teacherId: T, sectionId: "tour_sec_opt", title: "Геометрическая оптика", subject: "Физика", status: "active", sortOrder: 0 },
  ];

  const lessons: Lesson[] = [
    lesson("tour_l01", -112, 17, "done", "Кинематика: равномерное движение", "tour_tp_kin"),
    lesson("tour_l02", -105, 17, "done", "Кинематика: ускорение и графики", "tour_tp_kin"),
    lesson("tour_l03", -98, 17, "done", "Динамика: законы Ньютона", "tour_tp_dyn"),
    lesson("tour_l04", -91, 17, "done", "Динамика: силы трения и наклон", "tour_tp_dyn"),
    lesson("tour_l05", -84, 17, "done", "Статика: момент силы", "tour_tp_stat"),
    lesson("tour_l06", -77, 17, "done", "Работа и энергия", "tour_tp_cons"),
    lesson("tour_l07", -70, 17, "done", "Импульс и столкновения", "tour_tp_cons"),
    lesson("tour_l08", -63, 17, "done", "Колебания: пружинный маятник", "tour_tp_osc"),
    lesson("tour_l09", -56, 17, "done", "Волны и звук", "tour_tp_osc"),
    lesson("tour_l10", -49, 17, "done", "МКТ: давление и температура", "tour_tp_mkt"),
    lesson("tour_l11", -42, 17, "done", "Термодинамика: первое начало", "tour_tp_thermo"),
    lesson("tour_l12", -35, 17, "done", "Электростатика: поле и потенциал", "tour_tp_elstat"),
    lesson("tour_l13", -28, 17, "done", "Конденсаторы", "tour_tp_elstat"),
    lesson("tour_l14", -21, 17, "done", "Постоянный ток: закон Ома", "tour_tp_dc"),
    lesson("tour_l15", -14, 17, "done", "Цепи и мощность", "tour_tp_dc"),
    lesson("tour_l16", -7, 17, "done", "Магнитное поле тока", "tour_tp_mag"),
    lesson("tour_l17", -3, 17, "done", "Сила Ампера и Лоренца", "tour_tp_mag"),
    lesson("tour_l18", 2, 17, "planned", "Электромагнитная индукция", "tour_tp_ind"),
    lesson("tour_l19", 5, 17, "planned", "Самоиндукция и контур", "tour_tp_ind"),
    lesson("tour_l20", 9, 17, "planned", "Линзы и построение изображений", "tour_tp_lens"),
  ];

  const attendances: Attendance[] = lessons
    .filter((l) => l.status === "done")
    .map((l, i) => ({
      lessonId: l.id,
      studentId: S,
      status:
        i === 8
          ? ("absent_unexcused" as const)
          : i === 11
            ? ("absent_excused" as const)
            : ("present" as const),
    }));

  const homeworks: Homework[] = [
    hw("tour_hw01", "Кинематика: расчётные задачи", "tour_sec_mech", "tour_tp_kin", 8),
    hw("tour_hw02", "Графики движения", "tour_sec_mech", "tour_tp_kin", 6),
    hw("tour_hw03", "Законы Ньютона", "tour_sec_mech", "tour_tp_dyn", 10),
    hw("tour_hw04", "Силы на наклонной плоскости", "tour_sec_mech", "tour_tp_dyn", 7),
    hw("tour_hw05", "Момент силы и равновесие", "tour_sec_mech", "tour_tp_stat", 6),
    hw("tour_hw06", "Работа и кинетическая энергия", "tour_sec_mech", "tour_tp_cons", 9),
    hw("tour_hw07", "Импульс: разбор столкновений", "tour_sec_mech", "tour_tp_cons", 8),
    hw("tour_hw08", "Гармонические колебания", "tour_sec_mech", "tour_tp_osc", 7),
    hw("tour_hw09", "МКТ: идеальный газ", "tour_sec_mkt", "tour_tp_mkt", 8),
    hw("tour_hw10", "Первое начало термодинамики", "tour_sec_mkt", "tour_tp_thermo", 9),
    hw("tour_hw11", "Электрическое поле точечных зарядов", "tour_sec_em", "tour_tp_elstat", 8),
    hw("tour_hw12", "Закон Ома для участка цепи", "tour_sec_em", "tour_tp_dc", 10),
    hw("tour_hw13", "Мощность и тепло Джоуля — Ленца", "tour_sec_em", "tour_tp_dc", 7),
    hw("tour_hw14", "Магнитное поле прямого тока", "tour_sec_em", "tour_tp_mag", 6),
    hw("tour_hw15", "Сила Лоренца: траектории", "tour_sec_em", "tour_tp_mag", 8),
  ];

  const homeworkAssignments: HomeworkAssignment[] = [
    ha({ id: "tour_ha01", homeworkId: "tour_hw01", title: homeworks[0]!.title, status: "reviewed", assignedOffset: -110, dueOffset: -105, attempt1Percent: 62, attempt2Percent: 88, score: 7, maxScore: 8, lessonId: "tour_l01" }),
    ha({ id: "tour_ha02", homeworkId: "tour_hw02", title: homeworks[1]!.title, status: "reviewed", assignedOffset: -103, dueOffset: -98, attempt1Percent: 70, attempt2Percent: 100, score: 6, maxScore: 6, lessonId: "tour_l02" }),
    ha({ id: "tour_ha03", homeworkId: "tour_hw03", title: homeworks[2]!.title, status: "completed", assignedOffset: -96, dueOffset: -91, attempt1Percent: 80, attempt2Percent: 90, score: 9, maxScore: 10, lessonId: "tour_l03" }),
    ha({ id: "tour_ha04", homeworkId: "tour_hw04", title: homeworks[3]!.title, status: "reviewed", assignedOffset: -89, dueOffset: -84, attempt1Percent: 55, attempt2Percent: 82, score: 6, maxScore: 7, lessonId: "tour_l04" }),
    ha({ id: "tour_ha05", homeworkId: "tour_hw05", title: homeworks[4]!.title, status: "completed", assignedOffset: -82, dueOffset: -77, attempt1Percent: 90, score: 5, maxScore: 6, lessonId: "tour_l05" }),
    ha({ id: "tour_ha06", homeworkId: "tour_hw06", title: homeworks[5]!.title, status: "reviewed", assignedOffset: -75, dueOffset: -70, attempt1Percent: 75, attempt2Percent: 92, score: 8, maxScore: 9, lessonId: "tour_l06" }),
    ha({ id: "tour_ha07", homeworkId: "tour_hw07", title: homeworks[6]!.title, status: "completed", assignedOffset: -68, dueOffset: -63, attempt1Percent: 68, attempt2Percent: 85, score: 7, maxScore: 8, lessonId: "tour_l07" }),
    ha({ id: "tour_ha08", homeworkId: "tour_hw08", title: homeworks[7]!.title, status: "reviewed", assignedOffset: -61, dueOffset: -56, attempt1Percent: 72, attempt2Percent: 100, score: 7, maxScore: 7, lessonId: "tour_l08" }),
    ha({ id: "tour_ha09", homeworkId: "tour_hw09", title: homeworks[8]!.title, status: "completed", assignedOffset: -47, dueOffset: -42, attempt1Percent: 78, score: 6, maxScore: 8, lessonId: "tour_l10" }),
    ha({ id: "tour_ha10", homeworkId: "tour_hw10", title: homeworks[9]!.title, status: "reviewed", assignedOffset: -40, dueOffset: -35, attempt1Percent: 60, attempt2Percent: 88, score: 8, maxScore: 9, lessonId: "tour_l11" }),
    ha({ id: "tour_ha11", homeworkId: "tour_hw11", title: homeworks[10]!.title, status: "completed", assignedOffset: -33, dueOffset: -28, attempt1Percent: 85, score: 7, maxScore: 8, lessonId: "tour_l12" }),
    ha({ id: "tour_ha12", homeworkId: "tour_hw12", title: homeworks[11]!.title, status: "in_progress", assignedOffset: -19, dueOffset: -12, attempt1Percent: 40, maxScore: 10, lessonId: "tour_l14" }),
    ha({ id: "tour_ha13", homeworkId: "tour_hw13", title: homeworks[12]!.title, status: "assigned", assignedOffset: -12, dueOffset: -5, maxScore: 7, lessonId: "tour_l15" }),
    ha({ id: "tour_ha14", homeworkId: "tour_hw14", title: homeworks[13]!.title, status: "assigned", assignedOffset: -5, dueOffset: 2, maxScore: 6, lessonId: "tour_l16", missedNextLesson: false }),
    ha({ id: "tour_ha15", homeworkId: "tour_hw15", title: homeworks[14]!.title, status: "assigned", assignedOffset: -2, dueOffset: 4, maxScore: 8, lessonId: "tour_l17", missedNextLesson: true }),
  ];

  const theories: TheoryMaterial[] = [
    theoryMat("tour_th01", "Равномерное и равноускоренное движение", "Краткие формулы и типовые сюжеты задач.", -111, { hasVideo: true }),
    theoryMat("tour_th02", "Графики v(t) и x(t)", "Как читать ускорение и путь по графикам.", -104, { fileCount: 2 }),
    theoryMat("tour_th03", "Законы Ньютона в задачах ЕГЭ", "Системы тел и правильный выбор системы отсчёта.", -97, { hasVideo: true }),
    theoryMat("tour_th04", "Трение и наклонная плоскость", "Разложение сил и типичные ошибки.", -90),
    theoryMat("tour_th05", "Условия равновесия", "Момент силы и точка приложения.", -83),
    theoryMat("tour_th06", "Работа силы и теорема о кинетической энергии", "Связь работы и изменения энергии.", -76, { hasVideo: true }),
    theoryMat("tour_th07", "Закон сохранения импульса", "Упругие и неупругие столкновения.", -69),
    theoryMat("tour_th08", "Гармонические колебания", "Период, частота, энергия осциллятора.", -62, { hasVideo: true }),
    theoryMat("tour_th09", "Основное уравнение МКТ", "Давление идеального газа.", -48),
    theoryMat("tour_th10", "Первое начало термодинамики", "Изопроцессы и работа газа.", -41, { hasVideo: true, fileCount: 2 }),
    theoryMat("tour_th11", "Напряжённость и потенциал", "Поле точечного заряда и суперпозиция.", -34),
    theoryMat("tour_th12", "Закон Ома и соединения проводников", "Последовательное и параллельное соединение.", -20, { hasVideo: true }),
    theoryMat("tour_th13", "Мощность тока", "Теплота Джоуля — Ленца в цепях.", -13),
    theoryMat("tour_th14", "Магнитное поле тока", "Правило буравчика и сила Ампера.", -6, { hasVideo: true }),
    theoryMat("tour_th15", "Сила Лоренца", "Движение заряда в магнитном поле.", -2),
  ];

  const theoryAssignments: TheoryAssignment[] = [
    theoryAsg("tour_ta01", theories[0]!, "completed", -110),
    theoryAsg("tour_ta02", theories[1]!, "completed", -103),
    theoryAsg("tour_ta03", theories[2]!, "completed", -96),
    theoryAsg("tour_ta04", theories[3]!, "completed", -89),
    theoryAsg("tour_ta05", theories[4]!, "completed", -82),
    theoryAsg("tour_ta06", theories[5]!, "completed", -75),
    theoryAsg("tour_ta07", theories[6]!, "completed", -68),
    theoryAsg("tour_ta08", theories[7]!, "viewed", -61),
    theoryAsg("tour_ta09", theories[8]!, "completed", -47),
    theoryAsg("tour_ta10", theories[9]!, "completed", -40),
    theoryAsg("tour_ta11", theories[10]!, "viewed", -33),
    theoryAsg("tour_ta12", theories[11]!, "in_progress", -19),
    theoryAsg("tour_ta13", theories[12]!, "assigned", -12),
    theoryAsg("tour_ta14", theories[13]!, "assigned", -5),
    theoryAsg("tour_ta15", theories[14]!, "assigned", -1),
  ];
  // «На повторение»: колебания — просмотрена, но не закрыта как изученная.
  theoryAssignments[7]!.description =
    "Рекомендовано к повторению перед пробником по механике.";

  const intensives: Intensive[] = [
    {
      id: "tour_int_mech",
      teacherId: T,
      title: "Интенсив · Механика",
      description: "Кинематика, динамика и законы сохранения за 4 блока.",
      status: "published",
      embedAllowed: false,
      tests: [
        { testId: "tour_it_m1", title: "Кинематика", sortOrder: 0 },
        { testId: "tour_it_m2", title: "Динамика", sortOrder: 1 },
      ],
      fileCount: 3,
      assignedCount: 1,
      createdAt: atDay(-100, 10),
      updatedAt: atDay(-72, 10),
    },
    {
      id: "tour_int_elstat",
      teacherId: T,
      title: "Интенсив · Электростатика",
      description: "Поле, потенциал, конденсаторы.",
      status: "published",
      embedAllowed: false,
      tests: [{ testId: "tour_it_e1", title: "Электростатика", sortOrder: 0 }],
      fileCount: 2,
      assignedCount: 1,
      createdAt: atDay(-40, 10),
      updatedAt: atDay(-30, 10),
    },
    {
      id: "tour_int_dc",
      teacherId: T,
      title: "Интенсив · Постоянный ток",
      description: "Цепи постоянного тока и мощность.",
      status: "published",
      embedAllowed: false,
      tests: [{ testId: "tour_it_d1", title: "Постоянный ток", sortOrder: 0 }],
      fileCount: 2,
      assignedCount: 1,
      createdAt: atDay(-18, 10),
      updatedAt: atDay(-10, 10),
    },
    {
      id: "tour_int_mag",
      teacherId: T,
      title: "Интенсив · Магнитное поле",
      description: "Поле тока, сила Ампера и Лоренца.",
      status: "published",
      embedAllowed: false,
      tests: [{ testId: "tour_it_b1", title: "Магнетизм", sortOrder: 0 }],
      fileCount: 1,
      assignedCount: 1,
      createdAt: atDay(-8, 10),
      updatedAt: atDay(-4, 10),
    },
    {
      id: "tour_int_opt",
      teacherId: T,
      title: "Интенсив · Оптика",
      description: "Линзы и построение изображений. Старт после индукции.",
      status: "published",
      embedAllowed: false,
      tests: [],
      fileCount: 2,
      assignedCount: 1,
      createdAt: atDay(-1, 10),
      updatedAt: atDay(-1, 10),
    },
    {
      id: "tour_int_osc",
      teacherId: T,
      title: "Интенсив · Колебания и волны",
      description: "Механические колебания и основы волн. Доступен в записи.",
      status: "published",
      embedAllowed: false,
      tests: [{ testId: "tour_it_o1", title: "Колебания", sortOrder: 0 }],
      fileCount: 2,
      assignedCount: 1,
      createdAt: atDay(-65, 10),
      updatedAt: atDay(-55, 10),
    },
  ];

  const intensiveAssignments: IntensiveAssignment[] = [
    {
      id: "tour_ia_mech",
      intensiveId: "tour_int_mech",
      versionId: "tour_int_mech_v1",
      teacherId: T,
      studentId: S,
      assignedAt: atDay(-95, 15),
      title: intensives[0]!.title,
      description: intensives[0]!.description,
      embedAllowed: false,
      files: [],
      tests: [
        {
          testId: "tour_it_m1",
          title: "Кинематика",
          sortOrder: 0,
          dueAt: atDay(-88, 18),
          testAssignmentId: "tour_ha_int_m1",
          status: "reviewed",
          score: 8,
          maxScore: 10,
          completedAt: atDay(-90, 20),
        },
        {
          testId: "tour_it_m2",
          title: "Динамика",
          sortOrder: 1,
          dueAt: atDay(-80, 18),
          testAssignmentId: "tour_ha_int_m2",
          status: "completed",
          score: 9,
          maxScore: 10,
          completedAt: atDay(-81, 21),
        },
      ],
    },
    {
      id: "tour_ia_osc",
      intensiveId: "tour_int_osc",
      versionId: "tour_int_osc_v1",
      teacherId: T,
      studentId: S,
      assignedAt: atDay(-60, 15),
      title: intensives[5]!.title,
      description: "Запись доступна. Тест можно пройти повторно перед пробником.",
      embedAllowed: false,
      files: [],
      tests: [
        {
          testId: "tour_it_o1",
          title: "Колебания",
          sortOrder: 0,
          dueAt: atDay(-52, 18),
          testAssignmentId: "tour_ha_int_o1",
          status: "completed",
          score: 7,
          maxScore: 10,
          completedAt: atDay(-53, 19),
        },
      ],
    },
    {
      id: "tour_ia_elstat",
      intensiveId: "tour_int_elstat",
      versionId: "tour_int_elstat_v1",
      teacherId: T,
      studentId: S,
      assignedAt: atDay(-36, 15),
      title: intensives[1]!.title,
      description: intensives[1]!.description,
      embedAllowed: false,
      files: [],
      tests: [
        {
          testId: "tour_it_e1",
          title: "Электростатика",
          sortOrder: 0,
          dueAt: atDay(-28, 18),
          testAssignmentId: "tour_ha_int_e1",
          status: "completed",
          score: 8,
          maxScore: 10,
          completedAt: atDay(-29, 20),
        },
      ],
    },
    {
      id: "tour_ia_dc",
      intensiveId: "tour_int_dc",
      versionId: "tour_int_dc_v1",
      teacherId: T,
      studentId: S,
      assignedAt: atDay(-16, 15),
      title: intensives[2]!.title,
      description: intensives[2]!.description,
      embedAllowed: false,
      files: [],
      tests: [
        {
          testId: "tour_it_d1",
          title: "Постоянный ток",
          sortOrder: 0,
          dueAt: atDay(-8, 18),
          testAssignmentId: "tour_ha_int_d1",
          status: "assigned",
          score: null,
          maxScore: 10,
          completedAt: null,
        },
      ],
    },
    {
      id: "tour_ia_mag",
      intensiveId: "tour_int_mag",
      versionId: "tour_int_mag_v1",
      teacherId: T,
      studentId: S,
      assignedAt: atDay(-6, 15),
      title: intensives[3]!.title,
      description: intensives[3]!.description,
      embedAllowed: false,
      files: [],
      tests: [
        {
          testId: "tour_it_b1",
          title: "Магнетизм",
          sortOrder: 0,
          dueAt: atDay(3, 18),
          testAssignmentId: "tour_ha_int_b1",
          status: "assigned",
          score: null,
          maxScore: 10,
          completedAt: null,
        },
      ],
    },
    {
      id: "tour_ia_opt",
      intensiveId: "tour_int_opt",
      versionId: "tour_int_opt_v1",
      teacherId: T,
      studentId: S,
      assignedAt: atDay(0, 12),
      title: intensives[4]!.title,
      description: "Предстоящий блок. Материалы откроются после занятия по индукции.",
      embedAllowed: false,
      files: [],
      tests: [],
    },
  ];

  const mockExams: MockExam[] = [
    { id: "tour_mock1", teacherId: T, title: "Пробник №1 · сентябрь", date: dayKey(-100), description: "Проверен · заданий 14/26", createdAt: atDay(-100, 9), updatedAt: atDay(-100, 9) },
    { id: "tour_mock2", teacherId: T, title: "Пробник №2 · октябрь", date: dayKey(-70), description: "Проверен · заданий 16/26", createdAt: atDay(-70, 9), updatedAt: atDay(-70, 9) },
    { id: "tour_mock3", teacherId: T, title: "Пробник №3 · октябрь", date: dayKey(-45), description: "Проверен · заданий 18/26", createdAt: atDay(-45, 9), updatedAt: atDay(-45, 9) },
    { id: "tour_mock4", teacherId: T, title: "Пробник №4 · ноябрь", date: dayKey(-20), description: "Проверен · заданий 20/26", createdAt: atDay(-20, 9), updatedAt: atDay(-20, 9) },
    { id: "tour_mock5", teacherId: T, title: "Пробник №5 · ноябрь", date: dayKey(-5), description: "Проверен · заданий 22/26", createdAt: atDay(-5, 9), updatedAt: atDay(-4, 12) },
    { id: "tour_mock6", teacherId: T, title: "Пробник №6 · ближайший", date: dayKey(7), description: "Запланирован", createdAt: atDay(-1, 9), updatedAt: atDay(-1, 9) },
  ];

  const mockExamResults: MockExamResult[] = [
    { id: "tour_mr1", mockExamId: "tour_mock1", studentId: S, testScore: 48, createdAt: atDay(-99, 18), updatedAt: atDay(-99, 18) },
    { id: "tour_mr2", mockExamId: "tour_mock2", studentId: S, testScore: 56, createdAt: atDay(-69, 18), updatedAt: atDay(-69, 18) },
    { id: "tour_mr3", mockExamId: "tour_mock3", studentId: S, testScore: 63, createdAt: atDay(-44, 18), updatedAt: atDay(-44, 18) },
    { id: "tour_mr4", mockExamId: "tour_mock4", studentId: S, testScore: 71, createdAt: atDay(-19, 18), updatedAt: atDay(-19, 18) },
    { id: "tour_mr5", mockExamId: "tour_mock5", studentId: S, testScore: 76, createdAt: atDay(-4, 18), updatedAt: atDay(-4, 18) },
  ];

  const tariffId = "tour_tariff_16";
  const assignmentId = "tour_ta_active";

  return {
    version: 6,
    teachers: [
      {
        id: T,
        fullName: "Елена Волкова",
        avatarInitials: "ЕВ",
        subjects: ["Физика"],
        specializations: ["ЕГЭ", "механика", "электромагнетизм"],
        status: "active",
        bio: "Готовлю к ЕГЭ по физике: сначала картина явления, потом формулы и типовые задачи.",
        email: "elena.volkova@neodin.demo",
        defaultDurationMin: 60,
        workDays: [1, 2, 3, 4, 5],
        workIntervals: [{ start: "15:00", end: "21:00" }],
      },
    ],
    students: [
      {
        id: S,
        fullName: "Артём",
        grade: "11",
        telegram: "@artem_demo",
        phone: "+7 900 000-00-00",
        status: "active",
        teacherId: T,
        purchaseTariffId: tariffId,
        createdAt: atDay(-120, 10),
      },
    ],
    lessons,
    trialLessons: [],
    attendances,
    topicSections: sections,
    materialFolders: [],
    topics,
    homeworks,
    homeworkAssignments,
    theories,
    theoryAssignments,
    intensives,
    intensiveAssignments,
    mockExams,
    mockExamResults,
    tariffs: [
      {
        id: tariffId,
        name: "16 занятий · физика",
        price: 28800,
        currency: "RUB",
        durationDays: 70,
        lessonsLimit: 16,
        weeklyFrequency: 2,
        includesText:
          "Индивидуальные занятия, домашние задания, теория, интенсивы, тренажёр формул",
        features: [
          "individual_lessons",
          "homework",
          "extra_materials",
          "intensives",
        ],
        status: "active",
        productIds: ["tour_prd_trainer"],
      },
    ],
    tariffAssignments: [
      {
        id: "tour_ta_old",
        studentId: S,
        tariffId,
        startsAt: fromAppDateOnly(dayKey(-120)).toISOString(),
        endsAt: fromAppDateOnly(dayKey(-50)).toISOString(),
        priceSnapshot: 28800,
        currency: "RUB",
        status: "expired",
        paymentStatus: "paid",
        lessonsLimitSnapshot: 16,
        weeklyFrequencySnapshot: 2,
        durationDaysSnapshot: 70,
        lessonsUsed: 16,
        lessonsRemaining: 0,
        packageStatus: "exhausted",
        tariffName: "16 занятий · физика",
      },
      {
        id: assignmentId,
        studentId: S,
        tariffId,
        startsAt: fromAppDateOnly(dayKey(-49)).toISOString(),
        endsAt: fromAppDateOnly(dayKey(21)).toISOString(),
        priceSnapshot: 28800,
        currency: "RUB",
        status: "active",
        paymentStatus: "paid",
        lessonsLimitSnapshot: 16,
        weeklyFrequencySnapshot: 2,
        durationDaysSnapshot: 70,
        lessonsUsed: 9,
        lessonsRemaining: 7,
        packageStatus: "active",
        tariffName: "16 занятий · физика",
        includesText:
          "Индивидуальные занятия, домашние задания, теория, интенсивы, тренажёр формул",
      },
    ],
    payments: [
      {
        id: "tour_pay_old",
        studentId: S,
        assignmentId: "tour_ta_old",
        amount: 28800,
        currency: "RUB",
        status: "paid",
        provider: "manual",
        paidAt: atDay(-121, 14),
        createdAt: atDay(-121, 11),
      },
      {
        id: "tour_pay_cur",
        studentId: S,
        assignmentId,
        amount: 28800,
        currency: "RUB",
        status: "paid",
        provider: "manual",
        paidAt: atDay(-50, 14),
        createdAt: atDay(-50, 11),
      },
    ],
    products: [
      {
        id: "tour_prd_trainer",
        name: "Тренажёр формул по физике ЕГЭ",
        slug: FORMULA_TRAINER_PRODUCT_SLUG,
        description: "Интерактивный тренажёр в кабинете ученика.",
        isActive: true,
        implemented: true,
      },
    ],
    availableProductSlugs: [FORMULA_TRAINER_PRODUCT_SLUG],
    currentTeacherId: T,
    direkciyaTeacherId: T,
    currentStudentId: S,
  };
}

export function createStudentTourExtras(): StudentTourExtras {
  const teacherName = "Елена Волкова";
  const call = (
    id: string,
    offset: number,
    durationMin: number | null,
    topic: string,
    status: StudentTourExtras["calls"][number]["status"],
    note?: string
  ) => {
    const createdAt = atDay(offset, 17);
    return {
      id,
      createdAt,
      endedAt:
        status === "ended" && durationMin != null
          ? endAt(createdAt, durationMin)
          : null,
      durationMin,
      topic,
      teacherName,
      status,
      note,
    };
  };

  return {
    calls: [
      call("tour_c01", -112, 58, "Кинематика: равномерное движение", "ended"),
      call("tour_c02", -105, 61, "Кинематика: ускорение и графики", "ended"),
      call("tour_c03", -98, 55, "Динамика: законы Ньютона", "ended"),
      call("tour_c04", -91, 60, "Динамика: силы трения", "ended"),
      call("tour_c05", -84, 52, "Статика: момент силы", "ended"),
      call("tour_c06", -77, 59, "Работа и энергия", "ended"),
      call("tour_c07", -70, 57, "Импульс и столкновения", "ended"),
      call("tour_c08", -63, 60, "Колебания: пружинный маятник", "ended"),
      call("tour_c09", -56, null, "Волны и звук", "missed", "Ученик не подключился"),
      call("tour_c10", -49, 54, "МКТ: давление и температура", "ended"),
      call("tour_c11", -42, 62, "Термодинамика: первое начало", "ended"),
      call("tour_c12", -35, null, "Электростатика", "cancelled", "Перенесено по просьбе семьи"),
      call("tour_c13", -34, 58, "Электростатика: поле и потенциал", "ended"),
      call("tour_c14", -28, 56, "Конденсаторы", "ended"),
      call("tour_c15", -21, 60, "Постоянный ток: закон Ома", "ended"),
      call("tour_c16", -14, 59, "Цепи и мощность", "ended"),
      call("tour_c17", -7, 61, "Магнитное поле тока", "ended"),
      call("tour_c18", -3, 57, "Сила Ампера и Лоренца", "ended"),
    ],
    notifications: [
      {
        id: "tour_n1",
        createdAt: atDay(-1, 9),
        title: "Новая теория",
        body: "Елена Волкова отправила материал «Сила Лоренца».",
        kind: "theory",
      },
      {
        id: "tour_n2",
        createdAt: atDay(-2, 18),
        title: "Домашнее задание",
        body: "Назначено «Сила Лоренца: траектории» — срок через 4 дня.",
        kind: "homework",
      },
      {
        id: "tour_n3",
        createdAt: atDay(-4, 12),
        title: "Пробник проверен",
        body: "Пробник №5: 76 баллов (+5 к предыдущему).",
        kind: "exam",
      },
      {
        id: "tour_n4",
        createdAt: atDay(-5, 16),
        title: "Интенсив",
        body: "Открыт интенсив «Магнитное поле».",
        kind: "system",
      },
      {
        id: "tour_n5",
        createdAt: atDay(-7, 20),
        title: "Занятие завершено",
        body: "Тема: магнитное поле тока. Домашнее задание уже в кабинете.",
        kind: "lesson",
      },
    ],
    trainerHistory: [
      {
        id: "tour_tr1",
        finishedAt: atDay(-15, 21),
        sectionId: "current",
        sectionTitle: "Постоянный ток",
        topicId: "dc",
        topicTitle: "Закон Ома",
        difficulty: "medium",
        total: 8,
        correct: 6,
        durationSec: 720,
      },
      {
        id: "tour_tr2",
        finishedAt: atDay(-30, 20),
        sectionId: "electrostatics",
        sectionTitle: "Электростатика",
        topicId: "field",
        topicTitle: "Поле точечного заряда",
        difficulty: "easy",
        total: 6,
        correct: 5,
        durationSec: 480,
      },
    ],
  };
}
