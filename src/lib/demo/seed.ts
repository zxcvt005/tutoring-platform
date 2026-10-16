import type { DemoData } from "@/lib/types";

function atDay(offset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function endAt(startIso: string, durationMin: number): string {
  return new Date(new Date(startIso).getTime() + durationMin * 60_000).toISOString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function createSeedData(): DemoData {
  const teachers = [
    {
      id: "t1",
      fullName: "Анна Сергеева",
      avatarInitials: "АС",
      subjects: ["Математика"],
      specializations: ["ЕГЭ профиль", "10–11 класс"],
      phone: "+7 900 100-10-01",
      email: "anna@example.com",
      startedAt: daysAgo(400),
      status: "active" as const,
      lessonPrice: 2500,
      teacherPay: 1500,
      defaultDurationMin: 60,
      workDays: [1, 2, 3, 4, 5],
      workIntervals: [{ start: "10:00", end: "20:00" }],
      adminNotes: "Сильный методист, еженедельные отчёты.",
    },
    {
      id: "t2",
      fullName: "Игорь Петров",
      avatarInitials: "ИП",
      subjects: ["Физика"],
      specializations: ["ОГЭ", "механика"],
      phone: "+7 900 100-10-02",
      email: "igor@example.com",
      startedAt: daysAgo(200),
      status: "active" as const,
      lessonPrice: 2200,
      teacherPay: 1400,
      defaultDurationMin: 60,
      workDays: [1, 3, 5],
      workIntervals: [{ start: "15:00", end: "21:00" }],
    },
    {
      id: "t3",
      fullName: "Мария Козлова",
      avatarInitials: "МК",
      subjects: ["Английский"],
      specializations: ["B1–B2", "Speaking"],
      phone: "+7 900 100-10-03",
      email: "maria@example.com",
      startedAt: daysAgo(90),
      status: "active" as const,
      lessonPrice: 2000,
      teacherPay: 1300,
      defaultDurationMin: 45,
      workDays: [2, 4, 6],
      workIntervals: [{ start: "11:00", end: "19:00" }],
    },
    {
      id: "t4",
      fullName: "Денис Орлов",
      avatarInitials: "ДО",
      subjects: ["Информатика"],
      specializations: ["Олимпиады", "Python"],
      email: "denis@example.com",
      startedAt: daysAgo(600),
      status: "inactive" as const,
      lessonPrice: 2800,
      teacherPay: 1700,
      defaultDurationMin: 90,
      workDays: [5],
      workIntervals: [{ start: "16:00", end: "20:00" }],
      adminNotes: "Временно не берёт новых учеников.",
    },
  ];

  const students = [
    {
      id: "s1",
      fullName: "Алиса Иванова",
      contacts: "+7 900 111-22-01",
      status: "active" as const,
      teacherId: "t1",
      notes: "Готовится к профилю ЕГЭ",
    },
    {
      id: "s2",
      fullName: "Борис Смирнов",
      contacts: "boris@mail.test",
      status: "active" as const,
      teacherId: "t1",
    },
    {
      id: "s3",
      fullName: "Вера Кузнецова",
      status: "active" as const,
      teacherId: "t1",
    },
    {
      id: "s4",
      fullName: "Глеб Новиков",
      status: "paused" as const,
      teacherId: "t1",
      notes: "Пауза до ноября",
    },
    {
      id: "s5",
      fullName: "Дарья Морозова",
      contacts: "+7 900 111-22-05",
      status: "active" as const,
      teacherId: "t2",
    },
    {
      id: "s6",
      fullName: "Егор Волков",
      status: "active" as const,
      teacherId: "t2",
    },
    {
      id: "s7",
      fullName: "Жанна Соколова",
      status: "active" as const,
      teacherId: "t3",
    },
    {
      id: "s8",
      fullName: "Кирилл Лебедев",
      status: "active" as const,
      teacherId: "t3",
    },
    {
      id: "s9",
      fullName: "Лиза Ковалёва",
      status: "active" as const,
      teacherId: "t3",
    },
    {
      id: "s10",
      fullName: "Максим Егоров",
      status: "active" as const,
      teacherId: "t4",
    },
    {
      id: "s11",
      fullName: "Никита Белов",
      contacts: "nikita@mail.test",
      status: "active" as const,
      teacherId: "",
      notes: "Ждёт назначения преподавателя",
    },
  ];

  const topicSections = [
    {
      id: "sec1",
      teacherId: "t1",
      title: "Начала анализа",
      sortOrder: 0,
    },
    {
      id: "sec2",
      teacherId: "t1",
      title: "Тригонометрия",
      sortOrder: 1,
    },
    {
      id: "sec3",
      teacherId: "t2",
      title: "Электричество",
      sortOrder: 0,
    },
  ];

  const topics = [
    {
      id: "tp1",
      teacherId: "t1",
      sectionId: "sec1",
      title: "Производная: определение и таблица",
      subject: "Математика",
      description: "Базовые правила дифференцирования.",
      programNote: "ЕГЭ · блок «Начала анализа»",
      status: "active" as const,
      sortOrder: 0,
    },
    {
      id: "tp2",
      teacherId: "t1",
      sectionId: "sec2",
      title: "Тригонометрия: формулы приведения",
      subject: "Математика",
      status: "active" as const,
      sortOrder: 0,
    },
    {
      id: "tp3",
      teacherId: "t1",
      sectionId: "sec2",
      title: "Повторение ЕГЭ: тригонометрия",
      subject: "Математика",
      status: "active" as const,
      sortOrder: 1,
    },
    {
      id: "tp7",
      teacherId: "t1",
      sectionId: null,
      title: "Разбор типовых ошибок",
      subject: "Математика",
      description: "Свободная тема вне разделов программы.",
      status: "active" as const,
      sortOrder: 0,
    },
    {
      id: "tp4",
      teacherId: "t2",
      sectionId: "sec3",
      title: "Электричество: ток и напряжение",
      subject: "Физика",
      status: "active" as const,
      sortOrder: 0,
    },
    {
      id: "tp5",
      teacherId: "t3",
      sectionId: null,
      title: "Speaking: past experiences",
      subject: "Английский",
      status: "active" as const,
      sortOrder: 0,
    },
    {
      id: "tp6",
      teacherId: "t4",
      sectionId: null,
      title: "Алгоритмы: сортировки",
      subject: "Информатика",
      status: "archived" as const,
      sortOrder: 0,
    },
  ];

  const homeworks = [
    {
      id: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      title: "Таблица производных — 10 примеров",
      description: "Вычислить производные, сдать решения.",
      checkType: "score" as const,
      maxScore: 10,
      status: "active" as const,
    },
    {
      id: "hw2",
      topicId: "tp1",
      teacherId: "t1",
      title: "Мини-тест: определение производной",
      checkType: "score" as const,
      maxScore: 5,
      status: "active" as const,
    },
    {
      id: "hw3",
      topicId: "tp2",
      teacherId: "t1",
      title: "Формулы приведения — карточки",
      checkType: "pass_fail" as const,
      status: "active" as const,
    },
    {
      id: "hw4",
      topicId: "tp4",
      teacherId: "t2",
      title: "Задачи на силу тока",
      checkType: "score" as const,
      maxScore: 8,
      status: "active" as const,
    },
    {
      id: "hw5",
      topicId: "tp5",
      teacherId: "t3",
      title: "Записать 1-мин monologue",
      checkType: "comment" as const,
      status: "active" as const,
    },
  ];

  // Сегодня у Анны: параллельные независимые (16:00) + совместное (18:00) + короткое (19:15)
  const l1s = atDay(-2, 18, 0);
  const l2s = atDay(0, 18, 0); // joint s1+s2
  const l3s = atDay(0, 16, 0); // parallel A: s2
  const l3bs = atDay(0, 16, 0); // parallel B: s3 (same slot, different student)
  const l3cs = atDay(0, 19, 15); // short 30min
  const l4s = atDay(1, 17, 0);
  const l5s = atDay(2, 11, 0);
  const l6s = atDay(3, 18, 0);
  const l7s = atDay(4, 16, 0);
  const l8s = atDay(-1, 15, 0);
  const l9s = atDay(0, 11, 0);
  const l10s = atDay(5, 18, 0);

  const lessons = [
    {
      id: "l1",
      teacherId: "t1",
      studentIds: ["s1"],
      subject: "Математика",
      startsAt: l1s,
      endsAt: endAt(l1s, 60),
      status: "done" as const,
      topicId: "tp2",
    },
    {
      id: "l2",
      teacherId: "t1",
      studentIds: ["s1", "s2"],
      subject: "Математика",
      startsAt: l2s,
      endsAt: endAt(l2s, 60),
      status: "planned" as const,
    },
    {
      id: "l3",
      teacherId: "t1",
      studentIds: ["s2"],
      subject: "Математика",
      startsAt: l3s,
      endsAt: endAt(l3s, 45),
      status: "planned" as const,
    },
    {
      id: "l3b",
      teacherId: "t1",
      studentIds: ["s3"],
      subject: "Математика",
      startsAt: l3bs,
      endsAt: endAt(l3bs, 60),
      status: "planned" as const,
    },
    {
      id: "l3c",
      teacherId: "t1",
      studentIds: ["s1"],
      subject: "Математика",
      startsAt: l3cs,
      endsAt: endAt(l3cs, 30),
      status: "planned" as const,
    },
    {
      id: "l4",
      teacherId: "t2",
      studentIds: ["s5"],
      subject: "Физика",
      startsAt: l4s,
      endsAt: endAt(l4s, 60),
      status: "planned" as const,
    },
    {
      id: "l5",
      teacherId: "t3",
      studentIds: ["s7"],
      subject: "Английский",
      startsAt: l5s,
      endsAt: endAt(l5s, 45),
      status: "planned" as const,
    },
    {
      id: "l6",
      teacherId: "t1",
      studentIds: ["s3"],
      subject: "Математика",
      startsAt: l6s,
      endsAt: endAt(l6s, 90),
      status: "planned" as const,
    },
    {
      id: "l7",
      teacherId: "t4",
      studentIds: ["s10"],
      subject: "Информатика",
      startsAt: l7s,
      endsAt: endAt(l7s, 90),
      status: "cancelled" as const,
    },
    {
      id: "l8",
      teacherId: "t2",
      studentIds: ["s6"],
      subject: "Физика",
      startsAt: l8s,
      endsAt: endAt(l8s, 60),
      status: "done" as const,
      topicId: "tp4",
    },
    {
      id: "l9",
      teacherId: "t3",
      studentIds: ["s8", "s9"],
      subject: "Английский",
      startsAt: l9s,
      endsAt: endAt(l9s, 45),
      status: "planned" as const,
    },
    {
      id: "l10",
      teacherId: "t1",
      studentIds: ["s2"],
      subject: "Математика",
      startsAt: l10s,
      endsAt: endAt(l10s, 60),
      status: "planned" as const,
    },
  ];

  const attendances = [
    { lessonId: "l1", studentId: "s1", status: "present" as const },
    { lessonId: "l8", studentId: "s6", status: "present" as const },
  ];

  const homeworkAssignments = [
    {
      id: "ha1",
      homeworkId: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      studentId: "s1",
      dueAt: atDay(-1, 23, 0),
      status: "completed" as const,
      maxScore: 10,
      answerText:
        "1) (x²)' = 2x\n2) (sin x)' = cos x\n3) (e^x)' = e^x\n… остальные примеры в тетради.",
      completedAt: atDay(-1, 20, 0),
    },
    {
      id: "ha2",
      homeworkId: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      studentId: "s2",
      dueAt: atDay(2, 23, 0),
      status: "assigned" as const,
      maxScore: 10,
    },
    {
      id: "ha3",
      homeworkId: "hw2",
      topicId: "tp1",
      teacherId: "t1",
      studentId: "s1",
      dueAt: atDay(-3, 23, 0),
      status: "reviewed" as const,
      score: 4,
      maxScore: 5,
      feedback: "Хорошо, следите за знаками.",
      answerText: "Определение через предел приращения; таблица базовых производных.",
      completedAt: atDay(-3, 18, 0),
      reviewedAt: atDay(-2, 12, 0),
    },
    {
      id: "ha4",
      homeworkId: "hw3",
      topicId: "tp2",
      teacherId: "t1",
      studentId: "s3",
      dueAt: atDay(-5, 23, 0),
      status: "overdue" as const,
      maxScore: undefined,
    },
    {
      id: "ha5",
      homeworkId: "hw4",
      topicId: "tp4",
      teacherId: "t2",
      studentId: "s5",
      dueAt: atDay(1, 23, 0),
      status: "assigned" as const,
      maxScore: 8,
    },
    {
      id: "ha6",
      homeworkId: "hw5",
      topicId: "tp5",
      teacherId: "t3",
      studentId: "s7",
      dueAt: atDay(3, 23, 0),
      status: "completed" as const,
      answerText: "Last summer I travelled to Kazan and…",
      completedAt: atDay(0, 10, 0),
    },
    {
      id: "ha7",
      homeworkId: "hw3",
      topicId: "tp2",
      teacherId: "t1",
      studentId: "s1",
      dueAt: atDay(1, 23, 0),
      status: "assigned" as const,
    },
  ];

  return {
    version: 4,
    teachers,
    students,
    lessons,
    attendances,
    topicSections,
    topics,
    homeworks,
    homeworkAssignments,
    currentTeacherId: "t1",
    direkciyaTeacherId: "t1",
    currentStudentId: "s1",
  };
}
