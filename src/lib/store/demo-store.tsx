"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  apiBootstrap,
  apiFeatures,
  apiLogout,
  apiMe,
  apiPlatform,
  apiIntensiveUploadFile,
  apiTheoryUploadFile,
  cabinetHomeForRole,
  type AuthFeatures,
  type BootstrapAuth,
} from "@/lib/store/api-client";
import { reportClientError } from "@/lib/client-perf";
import { createCoalescedAsync } from "@/lib/store/coalesce-async";
import {
  createSerialAsyncQueue,
  demoSessionBootKey,
  rememberDemoExplicitLogout,
} from "@/lib/store/demo-session";
import { isCatalogHomeworkPurpose } from "@/lib/homework/source-kind";
import { isUnassignedActiveStudent } from "@/lib/students/unassigned";
import type {
  Attendance,
  AttendanceStatus,
  DemoData,
  Homework,
  HomeworkAssignment,
  Intensive,
  IntensiveAssignment,
  Lesson,
  Student,
  StudentAnswer,
  Teacher,
  TheoryAssignment,
  TheoryMaterial,
  Topic,
  TopicSection,
} from "@/lib/types";

type AssignHomeworkInput = {
  homeworkId: string;
  topicId?: string | null;
  teacherId: string;
  studentIds: string[];
  lessonId?: string;
  dueAt?: string;
};

type CompleteLessonInput = {
  lessonId: string;
  topicId?: string;
  topics?: { topicId?: string | null; title?: string | null }[];
  attendances?: { studentId: string; status: AttendanceStatus }[];
  homeworkAssign?: {
    homeworkId: string;
    studentIds: string[];
    dueAt?: string;
  };
  homeworkAssigns?: {
    homeworkId: string;
    studentIds: string[];
    dueAt?: string;
  }[];
};

type OkResult = {
  ok: boolean;
  error?: string;
  created?: number;
  ensured?: number;
  skipped?: number;
  id?: string;
  archived?: boolean;
  testAssignmentId?: string | null;
  status?: string;
  remaining?: number | null;
  directionId?: string | null;
  lessonStatus?: string | null;
};

export type DemoStoreValue = {
  data: DemoData;
  ready: boolean;
  auth: BootstrapAuth | null;
  features: AuthFeatures | null;
  demoLoginEnabled: boolean;
  reload: () => Promise<unknown>;
  logout: () => Promise<void>;
  setCurrentTeacherId: (id: string) => void;
  setDirekciyaTeacherId: (id: string) => void;
  setCurrentStudentId: (id: string) => void;
  resetDemo: () => void;
  upsertTeacher: (teacher: Omit<Teacher, "id"> & { id?: string }) => void;
  deleteTeacher: (id: string) => void;
  upsertStudent: (
    student: Omit<Student, "id"> & { id?: string }
  ) => Promise<OkResult>;
  deleteStudent: (input: {
    id: string;
    confirmFullName: string;
  }) => Promise<OkResult>;
  archiveStudent: (input: {
    id: string;
    reason: "trial_not_continued" | "stopped" | "other";
    comment?: string | null;
  }) => Promise<OkResult>;
  restoreStudent: (id: string) => Promise<OkResult>;
  upsertLesson: (
    lesson: Omit<Lesson, "id"> & { id?: string }
  ) => Promise<OkResult>;
  createRecurringSchedule: (input: {
    teacherId: string;
    studentIds: string[];
    weekdays: number[];
    startTime: string;
    durationMin: number;
    subject?: string;
    directionId?: string;
    activeFrom?: string;
    activeUntil?: string;
  }) => Promise<OkResult>;
  deleteLesson: (
    id: string,
    scope?: "this" | "thisAndFollowing"
  ) => Promise<OkResult>;
  updateLessonSeries: (input: {
    scheduleId: string;
    fromOccurrenceKey: string;
    startTime: string;
    durationMin: number;
    weekdays?: number[];
    directionId?: string | null;
  }) => Promise<OkResult>;
  ensureSchedulesMaterialized: (until?: string) => Promise<OkResult>;
  completeLesson: (input: CompleteLessonInput) => Promise<OkResult>;
  setAttendance: (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus
  ) => Promise<OkResult>;
  resetLessonConduct: (lessonId: string) => Promise<OkResult>;
  setLessonTopic: (
    lessonId: string,
    title: string,
    topicId?: string | null
  ) => Promise<OkResult>;
  setLessonTopics: (
    lessonId: string,
    topics: { topicId?: string | null; title?: string | null }[]
  ) => Promise<OkResult>;
  saveLessonContent: (input: {
    lessonId: string;
    studentId: string;
    topics: { topicId?: string | null; title?: string | null }[];
    homeworkIds: string[];
    attendanceStatus?: AttendanceStatus | null;
  }) => Promise<OkResult>;
  saveTopic: (
    topic: Omit<Topic, "id" | "sortOrder" | "sectionId"> & {
      id?: string;
      sectionId?: string | null;
      sortOrder?: number;
    }
  ) => Promise<OkResult & { id?: string }>;
  upsertTopicSection: (
    section: Omit<TopicSection, "id" | "sortOrder"> & {
      id?: string;
      sortOrder?: number;
    }
  ) => string;
  deleteTopicSection: (
    id: string,
    moveTopicsTo: string | null
  ) => Promise<OkResult>;
  reorderTopicSections: (teacherId: string, orderedIds: string[]) => void;
  upsertTopic: (
    topic: Omit<Topic, "id" | "sortOrder" | "sectionId"> & {
      id?: string;
      sectionId?: string | null;
      sortOrder?: number;
    }
  ) => string;
  deleteTopic: (id: string) => Promise<OkResult>;
  moveTopic: (
    topicId: string,
    sectionId: string | null,
    sortOrder?: number
  ) => void;
  reorderTopics: (
    teacherId: string,
    sectionId: string | null,
    orderedIds: string[]
  ) => void;
  upsertMaterialFolder: (input: {
    id?: string;
    title: string;
    parentId?: string | null;
    ownerScope: "school" | "teacher";
    teacherId?: string | null;
    sortOrder?: number;
    contentKind?:
      | "topic"
      | "theory"
      | "test"
      | "intensive"
      | "shared"
      | null;
  }) => Promise<OkResult & { id?: string }>;
  deleteMaterialFolder: (
    id: string,
    mode?: "empty_only" | "move_to_parent"
  ) => Promise<OkResult>;
  moveMaterialFolder: (
    folderId: string,
    targetParentId: string | null
  ) => Promise<OkResult>;
  pasteMaterialFolder: (input: {
    sourceFolderId: string;
    targetParentId: string | null;
  }) => Promise<OkResult & { folderId?: string }>;
  reorderMaterialFolders: (input: {
    ownerScope: "school" | "teacher";
    teacherId?: string | null;
    parentId: string | null;
    orderedIds: string[];
  }) => Promise<OkResult>;
  moveMaterialToFolder: (
    kind: "topic" | "test" | "theory" | "intensive",
    id: string,
    folderId: string | null
  ) => Promise<OkResult>;
  upsertHomework: (
    hw: Omit<Homework, "id"> & { id?: string }
  ) => Promise<OkResult & { id?: string }>;
  deleteHomework: (id: string) => Promise<OkResult>;
  restoreHomework: (id: string) => Promise<OkResult>;
  publishHomework: (id: string) => Promise<OkResult>;
  assignHomework: (input: AssignHomeworkInput) => Promise<OkResult>;
  upsertHomeworkAssignment: (
    a: Omit<HomeworkAssignment, "id"> & { id?: string }
  ) => void;
  saveHomeworkDraft: (
    id: string,
    answers: StudentAnswer[],
    attemptNumber?: 1 | 2,
    options?: { silent?: boolean }
  ) => Promise<OkResult>;
  submitHomeworkAssignment: (
    id: string,
    answers: StudentAnswer[],
    attemptNumber?: 1 | 2
  ) => Promise<OkResult>;
  reviewHomeworkAssignment: (
    id: string,
    updates: {
      questionId: string;
      manualScore: number;
      teacherComment?: string;
    }[],
    overallFeedback?: string
  ) => Promise<OkResult>;
  deleteHomeworkAssignment: (id: string) => Promise<OkResult>;
  upsertTheory: (input: {
    id?: string;
    teacherId: string;
    libraryScope?: "school" | "teacher";
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    testId?: string | null;
    publish?: boolean;
    folderId?: string | null;
  }) => Promise<OkResult & { id?: string }>;
  deleteTheory: (id: string) => Promise<OkResult>;
  reorderTheoryCatalogForGrade: (input: {
    grade: string;
    orderedMaterialIds: string[];
  }) => Promise<OkResult>;
  assignTheory: (input: {
    materialId: string;
    studentIds: string[];
  }) => Promise<OkResult>;
  markTheoryViewed: (id: string) => Promise<OkResult>;
  uploadTheoryFile: (materialId: string, file: File) => Promise<OkResult>;
  removeTheoryFile: (materialId: string, fileId: string) => Promise<OkResult>;
  upsertIntensive: (input: {
    id?: string;
    teacherId: string;
    libraryScope?: "school" | "teacher";
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    testIds: string[];
    publish?: boolean;
    folderId?: string | null;
  }) => Promise<OkResult & { id?: string }>;
  deleteIntensive: (id: string) => Promise<OkResult>;
  assignIntensive: (input: {
    intensiveId: string;
    studentId: string;
    deadlines: { testId: string; dueAt: string }[];
  }) => Promise<OkResult>;
  uploadIntensiveFile: (intensiveId: string, file: File) => Promise<OkResult>;
  removeIntensiveFile: (intensiveId: string, fileId: string) => Promise<OkResult>;
  createMockExam: (input: {
    title: string;
    date: string;
    description?: string | null;
  }) => Promise<OkResult>;
  updateMockExam: (input: {
    id: string;
    title: string;
    date: string;
    description?: string | null;
  }) => Promise<OkResult>;
  deleteMockExam: (id: string) => Promise<OkResult>;
  setMockExamResult: (input: {
    mockExamId: string;
    studentId: string;
    testScore: number | null;
  }) => Promise<OkResult>;
  studentsForTeacher: (teacherId: string) => Student[];
  unassignedStudents: () => Student[];
  lessonsForTeacher: (teacherId: string) => Lesson[];
  lessonsForStudent: (studentId: string) => Lesson[];
  sectionsForTeacher: (teacherId: string) => TopicSection[];
  topicsForTeacher: (teacherId: string) => Topic[];
  /** Каталог тем для урока: собственные + общая база. */
  topicsForLessonCatalog: (teacherId: string) => Topic[];
  homeworksForTopic: (topicId: string) => Homework[];
  homeworksForTeacher: (teacherId: string) => Homework[];
  publishedHomeworksForTopic: (topicId: string) => Homework[];
  publishedHomeworksForTeacher: (teacherId: string) => Homework[];
  /** Опубликованные тесты для назначения на уроке (свои + общая база). */
  publishedHomeworksForLessonCatalog: (teacherId: string) => Homework[];
  assignmentsForTeacher: (teacherId: string) => HomeworkAssignment[];
  assignmentsForStudent: (studentId: string) => HomeworkAssignment[];
  theoriesForTeacher: (teacherId: string) => TheoryMaterial[];
  publishedTheoriesForTeacher: (teacherId: string) => TheoryMaterial[];
  theoryAssignmentsForTeacher: (teacherId: string) => TheoryAssignment[];
  theoryAssignmentsForStudent: (studentId: string) => TheoryAssignment[];
  intensivesForTeacher: (teacherId: string) => Intensive[];
  intensiveAssignmentsForTeacher: (teacherId: string) => IntensiveAssignment[];
  intensiveAssignmentsForStudent: (studentId: string) => IntensiveAssignment[];
  attendancesForLesson: (lessonId: string) => Attendance[];
};

export const DemoStoreContext = createContext<DemoStoreValue | null>(null);

const EMPTY_DATA: DemoData = {
  version: 6,
  teachers: [],
  students: [],
  lessons: [],
  trialLessons: [],
  attendances: [],
  topicSections: [],
  materialFolders: [],
  topics: [],
  homeworks: [],
  homeworkAssignments: [],
  theories: [],
  theoryAssignments: [],
  theoryCatalogOrder: [],
  intensives: [],
  intensiveAssignments: [],
  mockExams: [],
  mockExamResults: [],
  learningDirections: [],
  tariffs: [],
  lessonOrders: [],
  studentDirectionBalances: [],
  tariffAssignments: [],
  payments: [],
  settlementDocuments: [],
  products: [],
  availableProductSlugs: [],
  currentTeacherId: "",
  direkciyaTeacherId: "",
  currentStudentId: "",
};

function newClientId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

type ReloadMode = "coalesce" | "skip";

/**
 * Действия, для которых ключ строится из payload.id (создание/обновление сущности).
 * upsertHomework намеренно НЕ здесь: один и тот же test id сохраняется много раз
 * с разным набором вопросов (добавление задания, ensureTestReady перед картинкой).
 * Стабильный ключ `upsertHomework:${id}` реплеил первый ответ и оставлял в БД
 * старый questionsPublic → «Вопрос не найден в этом тесте» при upload.
 */
const IDEMPOTENT_ENTITY_ACTIONS = new Set([
  "upsertStudent",
  "upsertTeacher",
  "upsertLesson",
  "upsertTopic",
  "upsertTopicSection",
  "upsertMaterialFolder",
  "createMockExam",
]);

function idempotencyKeyFor(
  action: string,
  payload: unknown,
  explicit?: string
): string | undefined {
  if (explicit) return explicit;
  if (!IDEMPOTENT_ENTITY_ACTIONS.has(action)) return undefined;
  if (!payload || typeof payload !== "object") return undefined;
  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "string" || !id) return undefined;
  return `${action}:${id}`;
}

function patchStudentDirectionBalance(
  data: DemoData,
  studentId: string,
  directionId: string,
  remaining: number
): DemoData {
  const students = data.students.map((s) => {
    if (s.id !== studentId) return s;
    const balances = [...(s.directionBalances ?? [])];
    const idx = balances.findIndex((b) => b.directionId === directionId);
    if (idx >= 0) {
      balances[idx] = { ...balances[idx]!, balance: remaining };
    } else {
      balances.push({ directionId, balance: remaining });
    }
    return { ...s, directionBalances: balances };
  });
  const rows = [...(data.studentDirectionBalances ?? [])];
  const rowIdx = rows.findIndex(
    (r) => r.studentId === studentId && r.directionId === directionId
  );
  if (rowIdx >= 0) {
    rows[rowIdx] = { ...rows[rowIdx]!, remaining };
  } else {
    rows.push({
      studentId,
      directionId,
      remaining,
      used: 0,
    });
  }
  return { ...data, students, studentDirectionBalances: rows };
}

function upsertAttendanceRow(
  attendances: Attendance[],
  lessonId: string,
  studentId: string,
  status: AttendanceStatus
): Attendance[] {
  const rest = attendances.filter(
    (row) => row.lessonId !== lessonId || row.studentId !== studentId
  );
  return [...rest, { lessonId, studentId, status }];
}

function patchLessonInData(
  lessons: Lesson[],
  lesson: Omit<Lesson, "id"> & { id?: string }
): Lesson[] {
  const id = lesson.id;
  if (!id) return lessons;
  const idx = lessons.findIndex((l) => l.id === id);
  const merged = { ...lessons[idx], ...lesson, id } as Lesson;
  if (idx === -1) return [...lessons, merged];
  const next = lessons.slice();
  next[idx] = merged;
  return next;
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bootKey = demoSessionBootKey(pathname);
  const router = useRouter();
  const [data, setData] = useState<DemoData>(EMPTY_DATA);
  const [auth, setAuth] = useState<BootstrapAuth | null>(null);
  const [features, setFeatures] = useState<AuthFeatures | null>(null);
  const [ready, setReady] = useState(false);
  const [filterTeacherId, setFilterTeacherId] = useState("sch_t1");
  const [filterStudentId, setFilterStudentId] = useState("sch_s01");
  const enqueueBoot = useMemo(() => createSerialAsyncQueue(), []);
  const prevBootKeyRef = useRef(bootKey);
  const pathnameRef = useRef(pathname);

  const reloadImmediate = useCallback(async () => {
    const boot = await apiBootstrap();
    setData(boot.data);
    setAuth(boot.auth);
    return boot;
  }, []);

  const reload = useMemo(
    () => createCoalescedAsync(reloadImmediate, 280),
    [reloadImmediate]
  );

  const logout = useCallback(async () => {
    rememberDemoExplicitLogout();
    await apiLogout();
    setAuth(null);
    setData(EMPTY_DATA);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    if (prevBootKeyRef.current !== bootKey && bootKey !== "public") {
      setReady(false);
    }
    prevBootKeyRef.current = bootKey;
    void enqueueBoot(async () => {
      if (cancelled) return;
      try {
        const feats = await apiFeatures();
        if (cancelled) return;
        setFeatures({ ...feats, demoLogin: false, demoAccounts: [] });

        if (bootKey === "public") {
          if (!cancelled) setReady(true);
          return;
        }

        const role = bootKey;
        const me = await apiMe();
        if (cancelled) return;

        if (!me) {
          if (feats.needsBootstrap) {
            router.replace("/setup");
            return;
          }
          const next = encodeURIComponent(pathnameRef.current || "/");
          router.replace(`/login?next=${next}`);
          return;
        }

        const meRole = (me as { role?: string } | null)?.role;
        if (meRole && meRole !== role) {
          router.replace(
            cabinetHomeForRole(
              meRole as
                | "director"
                | "teacher"
                | "student"
                | "press"
                | "assistant"
            )
          );
          return;
        }

        if (!cancelled) await reloadImmediate();
      } catch (e) {
        reportClientError("demo-boot", e);
        if (!cancelled) {
          toast.error(
            e instanceof Error
              ? e.message
              : "Нет связи с сервером. Обновите страницу или войдите снова."
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // bootKey, not pathname: переход внутри кабинета не должен заново проверять сессию.
  }, [bootKey, enqueueBoot, reloadImmediate, router]);

  const run = useCallback(
    async (
      action: string,
      payload?: unknown,
      idem?: string,
      patch?: (prev: DemoData) => DemoData,
      reloadMode: ReloadMode = "coalesce"
    ): Promise<OkResult> => {
      const started =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        const result = await apiPlatform<{
          created?: number;
          ensured?: number;
          skipped?: number;
          id?: string;
          archived?: boolean;
          testAssignmentId?: string | null;
          status?: string;
          remaining?: number | null;
          directionId?: string | null;
          lessonStatus?: string | null;
        }>(action, payload, idempotencyKeyFor(action, payload, idem));
        const afterPlatform =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (patch) {
          setData((prev) => patch(prev));
        }
        if (reloadMode !== "skip") {
          try {
            await reload();
          } catch (reloadErr) {
            reportClientError("demo-reload", reloadErr);
            toast.warning(
              "Изменения сохранены, но не удалось обновить данные с сервера. Обновите страницу при необходимости."
            );
          }
        }
        const ended =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const totalMs = Math.round(ended - started);
        const platformMs = Math.round(afterPlatform - started);
        const reloadMs = Math.round(ended - afterPlatform);
        if (totalMs >= 800) {
          console.info("[client-timing]", {
            label: `run:${action}`,
            durationMs: totalMs,
            platformMs,
            reloadMs,
            reloadMode,
          });
        }
        return {
          ok: true,
          created: result.created,
          ensured: result.ensured,
          skipped: result.skipped,
          id: result.id,
          archived: result.archived,
          testAssignmentId: result.testAssignmentId,
          status: result.status,
          remaining: result.remaining,
          directionId: result.directionId,
          lessonStatus: result.lessonStatus,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Ошибка сервера";
        toast.error(message);
        return { ok: false, error: message };
      }
    },
    [reload]
  );

  // Фоновая материализация после ready: не блокирует bootstrap,
  // но держит ближайшие недели расписания актуальными.
  useEffect(() => {
    if (!ready || !auth) return;
    if (
      auth.role !== "director" &&
      auth.role !== "teacher" &&
      auth.role !== "press"
    )
      return;
    let cancelled = false;
    const until = new Date();
    until.setDate(until.getDate() + 21);
    void (async () => {
      const r = await run(
        "ensureSchedulesMaterialized",
        { until: until.toISOString() },
        undefined,
        undefined,
        "skip"
      );
      if (cancelled || !r.ok) return;
      if ((r.created ?? 0) > 0) {
        try {
          await reload();
        } catch (err) {
          reportClientError("schedule-materialize-reload", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, auth, run, reload]);

  const setCurrentTeacherId = useCallback((id: string) => {
    setFilterTeacherId(id);
    setData((d) => ({ ...d, currentTeacherId: id }));
  }, []);

  const setDirekciyaTeacherId = useCallback((id: string) => {
    setData((d) => ({ ...d, direkciyaTeacherId: id }));
  }, []);

  const setCurrentStudentId = useCallback((id: string) => {
    setFilterStudentId(id);
    setData((d) => ({ ...d, currentStudentId: id }));
  }, []);

  const value: DemoStoreValue = {
      data: {
        ...data,
        currentTeacherId:
          auth?.role === "teacher"
            ? auth.teacherId ?? data.currentTeacherId
            : data.direkciyaTeacherId || data.currentTeacherId || filterTeacherId,
        direkciyaTeacherId: data.direkciyaTeacherId || filterTeacherId,
        currentStudentId:
          auth?.role === "student"
            ? auth.studentId ?? data.currentStudentId
            : data.currentStudentId || filterStudentId,
      },
      ready,
      auth,
      features,
      demoLoginEnabled: false,
      reload,
      logout,
      setCurrentTeacherId,
      setDirekciyaTeacherId,
      setCurrentStudentId,
      resetDemo: () => undefined,
      upsertTeacher: (teacher) => {
        void run("upsertTeacher", teacher);
      },
      deleteTeacher: (id) => {
        void run("deleteTeacher", { id });
      },
      upsertStudent: (student) => {
        const id = student.id ?? newClientId("s");
        const next = { ...student, id };
        return run(
          "upsertStudent",
          next,
          `upsertStudent:${id}`,
          (d) => {
            const idx = d.students.findIndex((s) => s.id === id);
            const merged = {
              ...(idx >= 0 ? d.students[idx] : {}),
              ...next,
            } as Student;
            const students =
              idx === -1
                ? [...d.students, merged]
                : d.students.map((s, i) => (i === idx ? merged : s));
            return { ...d, students };
          }
        );
      },
      deleteStudent: (input) => run("deleteStudent", input),
      archiveStudent: (input) => run("archiveStudent", input),
      restoreStudent: (id) => run("restoreStudent", { id }),
      upsertLesson: (lesson) => {
        const id = lesson.id ?? newClientId("les");
        const next = { ...lesson, id };
        return run(
          "upsertLesson",
          next,
          `upsertLesson:${id}`,
          (d) => ({
            ...d,
            lessons: patchLessonInData(d.lessons, next),
          })
        );
      },
      createRecurringSchedule: async (input) => {
        const r = await run("createRecurringSchedule", input);
        if (r.ok) {
          toast.success(
            r.created
              ? `Регулярное расписание: создано занятий — ${r.created}`
              : "Регулярное расписание сохранено"
          );
        }
        return r;
      },
      deleteLesson: (id, scope = "this") =>
        run("deleteLesson", { id, scope }),
      updateLessonSeries: (input) => run("updateLessonSeries", input),
      ensureSchedulesMaterialized: (until) =>
        run("ensureSchedulesMaterialized", until ? { until } : {}, undefined, undefined, "skip"),
      completeLesson: async (input) => {
        const r = await run(
          "completeLesson",
          input,
          undefined,
          (d) => {
            const attendances = [...d.attendances];
            for (const row of input.attendances ?? []) {
              const next = upsertAttendanceRow(
                attendances,
                input.lessonId,
                row.studentId,
                row.status
              );
              attendances.splice(0, attendances.length, ...next);
            }
            const lessons = d.lessons.map((l) =>
              l.id === input.lessonId && (input.attendances?.length ?? 0) > 0
                ? { ...l, status: "done" as const }
                : l
            );
            return { ...d, attendances, lessons };
          }
        );
        if (r.ok) toast.success("Занятие проведено");
        return r;
      },
      setAttendance: async (lessonId, studentId, status) => {
        const r = await run(
          "setAttendance",
          { lessonId, studentId, status },
          undefined,
          (d) => ({
            ...d,
            attendances: upsertAttendanceRow(
              d.attendances,
              lessonId,
              studentId,
              status
            ),
          }),
          "skip"
        );
        if (!r.ok) return r;
        setData((d) => {
          let next = d;
          if (r.lessonStatus === "done") {
            next = {
              ...next,
              lessons: next.lessons.map((l) =>
                l.id === lessonId ? { ...l, status: "done" as const } : l
              ),
            };
          }
          if (
            typeof r.remaining === "number" &&
            typeof r.directionId === "string" &&
            r.directionId
          ) {
            next = patchStudentDirectionBalance(
              next,
              studentId,
              r.directionId,
              r.remaining
            );
          }
          return next;
        });
        return r;
      },
      resetLessonConduct: (lessonId) =>
        run("resetLessonConduct", { lessonId }),
      setLessonTopic: (lessonId, title, topicId) =>
        run(
          "setLessonTopic",
          { lessonId, title, topicId: topicId ?? null },
          undefined,
          (d) => ({
            ...d,
            lessons: d.lessons.map((l) =>
              l.id === lessonId
                ? {
                    ...l,
                    subject: title || l.subject,
                    topicId: topicId || undefined,
                  }
                : l
            ),
          }),
          "skip"
        ),
      setLessonTopics: (lessonId, topics) =>
        run(
          "setLessonTopics",
          { lessonId, topics },
          undefined,
          (d) => ({
            ...d,
            lessons: d.lessons.map((l) => {
              if (l.id !== lessonId) return l;
              const links = topics.map((t, i) => ({
                id: `lt_${lessonId}_${i}`,
                topicId: t.topicId ?? null,
                title: t.title ?? "",
                sortOrder: i,
              }));
              return {
                ...l,
                lessonTopics: links,
                subject: links[0]?.title || l.subject,
                topicId: links[0]?.topicId || undefined,
              };
            }),
          }),
          "skip"
        ),
      saveLessonContent: async (input) => {
        try {
          const result = await apiPlatform<{
            homework?: { created?: number; removed?: number };
          }>("saveLessonContent", input);
          try {
            await reload();
          } catch (reloadErr) {
            reportClientError("demo-reload", reloadErr);
            toast.warning(
              "Изменения сохранены, но не удалось обновить данные с сервера. Обновите страницу при необходимости."
            );
          }
          return {
            ok: true,
            created: result.homework?.created ?? 0,
          };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка сервера";
          toast.error(message);
          return { ok: false, error: message };
        }
      },
      saveTopic: async (topic) => {
        const id = topic.id ?? newClientId("tp");
        const r = await run(
          "upsertTopic",
          { ...topic, id },
          undefined,
          (d) => {
            const idx = d.topics.findIndex((t) => t.id === id);
            const next = { ...topic, id } as (typeof d.topics)[number];
            const topics =
              idx === -1
                ? [...d.topics, next]
                : d.topics.map((t, i) => (i === idx ? { ...t, ...next } : t));
            return { ...d, topics };
          },
          "skip"
        );
        return { ...r, id: r.id ?? id };
      },
      upsertTopicSection: (section) => {
        const id = section.id ?? newClientId("sec");
        void run(
          "upsertTopicSection",
          { ...section, id },
          undefined,
          (d) => {
            const idx = d.topicSections.findIndex((s) => s.id === id);
            const next = { ...section, id } as (typeof d.topicSections)[number];
            const topicSections =
              idx === -1
                ? [...d.topicSections, next]
                : d.topicSections.map((s, i) => (i === idx ? { ...s, ...next } : s));
            return { ...d, topicSections };
          },
          "skip"
        );
        return id;
      },
      deleteTopicSection: (id, moveTopicsTo) =>
        run("deleteTopicSection", { id, moveTopicsTo }),
      reorderTopicSections: (teacherId, orderedIds) => {
        void run(
          "reorderTopicSections",
          { teacherId, orderedIds },
          undefined,
          (d) => ({
            ...d,
            topicSections: d.topicSections.map((s) => {
              if (s.teacherId !== teacherId) return s;
              const sortOrder = orderedIds.indexOf(s.id);
              return sortOrder >= 0 ? { ...s, sortOrder } : s;
            }),
          }),
          "skip"
        );
      },
      upsertTopic: (topic) => {
        const id = topic.id ?? newClientId("tp");
        void run(
          "upsertTopic",
          { ...topic, id },
          undefined,
          (d) => {
            const idx = d.topics.findIndex((t) => t.id === id);
            const next = { ...topic, id } as (typeof d.topics)[number];
            const topics =
              idx === -1
                ? [...d.topics, next]
                : d.topics.map((t, i) => (i === idx ? { ...t, ...next } : t));
            return { ...d, topics };
          },
          "skip"
        );
        return id;
      },
      deleteTopic: async (id) => {
        const r = await run("deleteTopic", { id });
        if (r.ok) {
          toast.success(
            r.archived
              ? "Тема архивирована (есть связанные тесты или назначения)"
              : "Тема удалена"
          );
        }
        return r;
      },
      moveTopic: (topicId, sectionId, sortOrder) => {
        void run(
          "moveTopic",
          { topicId, sectionId, sortOrder },
          undefined,
          (d) => ({
            ...d,
            topics: d.topics.map((t) =>
              t.id === topicId
                ? {
                    ...t,
                    sectionId: sectionId ?? t.sectionId,
                    sortOrder:
                      typeof sortOrder === "number" ? sortOrder : t.sortOrder,
                  }
                : t
            ),
          }),
          "skip"
        );
      },
      reorderTopics: (teacherId, sectionId, orderedIds) => {
        void run(
          "reorderTopics",
          { teacherId, sectionId, orderedIds },
          undefined,
          (d) => ({
            ...d,
            topics: d.topics.map((t) => {
              if (t.teacherId !== teacherId || t.sectionId !== sectionId) {
                return t;
              }
              const order = orderedIds.indexOf(t.id);
              return order >= 0 ? { ...t, sortOrder: order } : t;
            }),
          }),
          "skip"
        );
      },
      upsertMaterialFolder: async (input) => {
        const id = input.id ?? newClientId("fld");
        const r = await run("upsertMaterialFolder", { ...input, id });
        return { ...r, id: r.ok ? (r.id ?? id) : undefined };
      },
      deleteMaterialFolder: (id, mode = "move_to_parent") =>
        run("deleteMaterialFolder", { id, mode }),
      moveMaterialFolder: (folderId, targetParentId) =>
        run("moveMaterialFolder", { folderId, targetParentId }),
      pasteMaterialFolder: (input) =>
        run("pasteMaterialFolder", input) as Promise<
          OkResult & { folderId?: string }
        >,
      reorderMaterialFolders: (input) =>
        run("reorderMaterialFolders", input),
      moveMaterialToFolder: (kind, id, folderId) =>
        run("moveMaterialToFolder", { kind, id, folderId }),
      upsertHomework: async (hw) => {
        const id = hw.id ?? newClientId("hw");
        const r = await run("upsertHomework", { ...hw, id });
        return { ...r, id: r.ok ? (r.id ?? id) : undefined };
      },
      deleteHomework: async (id) => {
        const r = await run("deleteHomework", { id });
        if (r.ok) {
          toast.success(
            r.archived
              ? "Тест архивирован (есть назначения ученикам)"
              : "Тест удалён"
          );
        }
        return r;
      },
      restoreHomework: async (id) => {
        const r = await run("restoreHomework", { id });
        if (r.ok) toast.success("Тест восстановлен из архива");
        return r;
      },
      publishHomework: async (id) => {
        const r = await run("publishHomework", { id });
        if (r.ok) toast.success("Тест опубликован");
        return r;
      },
      assignHomework: async (input) => {
        const r = await run("assignHomework", input);
        if (r.ok) {
          const created = r.created ?? 0;
          if (created > 0) {
            toast.success(`Назначено: ${created}`);
          } else if ((r as { ensured?: number }).ensured) {
            toast.message("Домашнее задание уже было назначено");
          } else {
            toast.error("Домашнее задание не создано");
            return {
              ok: false,
              error: "Домашнее задание не создано",
              created: 0,
            };
          }
        }
        return { ...r, created: r.created ?? 0 };
      },
      upsertHomeworkAssignment: () => {
        toast.message("Используйте сдачу или проверку задания");
      },
      saveHomeworkDraft: async (id, answers, attemptNumber = 1, options) => {
        const r = await run(
          "saveHomeworkDraft",
          { id, answers, attemptNumber },
          undefined,
          (d) => ({
            ...d,
            homeworkAssignments: d.homeworkAssignments.map((a) =>
              a.id === id ? { ...a, answers } : a
            ),
          }),
          "skip"
        );
        if (r.ok && !options?.silent) toast.success("Черновик сохранён");
        return r;
      },
      submitHomeworkAssignment: async (id, answers, attemptNumber = 1) => {
        const r = await run(
          "submitHomeworkAssignment",
          { id, answers, attemptNumber },
          `submit-${id}-${attemptNumber}`
        );
        if (r.ok) toast.success("Работа отправлена");
        return r;
      },
      reviewHomeworkAssignment: async (id, updates, overallFeedback) => {
        const r = await run(
          "reviewHomeworkAssignment",
          { id, updates, overallFeedback },
          `review-${id}-${Date.now()}`
        );
        if (r.ok) toast.success("Проверка сохранена");
        return r;
      },
      deleteHomeworkAssignment: (id) => run("deleteHomeworkAssignment", { id }),
      upsertTheory: async (input) => {
        const r = await run("upsertTheory", input);
        if (r.ok) {
          toast.success(input.publish ? "Теория опубликована" : "Теория сохранена");
        }
        return r;
      },
      deleteTheory: async (id) => {
        const r = await run("deleteTheory", { id });
        if (r.ok) {
          toast.success(r.archived ? "Теория архивирована" : "Теория удалена");
        }
        return r;
      },
      reorderTheoryCatalogForGrade: async (input) => {
        const r = await run(
          "reorderTheoryCatalogForGrade",
          input,
          undefined,
          (d) => ({
            ...d,
            theoryCatalogOrder: [
              ...d.theoryCatalogOrder.filter((row) => row.grade !== input.grade),
              ...input.orderedMaterialIds.map((materialId, sortOrder) => ({
                grade: input.grade,
                materialId,
                sortOrder,
              })),
            ],
          })
        );
        return r;
      },
      assignTheory: async (input) => {
        const r = await run(
          "assignTheory",
          input,
          `assign-theory-${input.materialId}-${input.studentIds.join(",")}`
        );
        if (r.ok) {
          toast.success(
            r.created
              ? `Отправлено ученикам: ${r.created}`
              : "Этим ученикам теория уже назначена"
          );
        }
        return r;
      },
      markTheoryViewed: async (id) => {
        const r = await run("markTheoryViewed", { id }, `theory-viewed-${id}`);
        if (!r.ok) return r;
        return r;
      },
      uploadTheoryFile: async (materialId, file) => {
        try {
          await apiTheoryUploadFile(materialId, file);
          await reload();
          toast.success("Файл прикреплён");
          return { ok: true };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка загрузки";
          toast.error(message);
          return { ok: false, error: message };
        }
      },
      removeTheoryFile: async (materialId, fileId) => {
        const r = await run("removeTheoryFile", { materialId, fileId });
        if (r.ok) toast.success("Файл откреплён");
        return r;
      },
      upsertIntensive: async (input) => {
        const r = await run("upsertIntensive", input);
        if (r.ok) {
          toast.success(
            input.publish ? "Интенсив опубликован" : "Интенсив сохранён"
          );
        }
        return r;
      },
      deleteIntensive: async (id) => {
        const r = await run("deleteIntensive", { id });
        if (r.ok) {
          toast.success(r.archived ? "Интенсив архивирован" : "Интенсив удалён");
        }
        return r;
      },
      assignIntensive: async (input) => {
        const r = await run(
          "assignIntensive",
          input,
          `assign-intensive-${input.intensiveId}-${input.studentId}`
        );
        if (r.ok) toast.success("Интенсив отправлен");
        return r;
      },
      uploadIntensiveFile: async (intensiveId, file) => {
        try {
          await apiIntensiveUploadFile(intensiveId, file);
          await reload();
          toast.success("Конспект прикреплён");
          return { ok: true };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка загрузки";
          toast.error(message);
          return { ok: false, error: message };
        }
      },
      removeIntensiveFile: async (intensiveId, fileId) => {
        const r = await run("removeIntensiveFile", { intensiveId, fileId });
        if (r.ok) toast.success("Конспект откреплён");
        return r;
      },
      createMockExam: async (input) => {
        const r = await run("createMockExam", input);
        if (r.ok) toast.success("Пробник создан");
        return r;
      },
      updateMockExam: async (input) => {
        const r = await run("updateMockExam", input);
        if (r.ok) toast.success("Пробник обновлён");
        return r;
      },
      deleteMockExam: async (id) => {
        const r = await run("deleteMockExam", { id });
        if (r.ok) toast.success("Пробник удалён");
        return r;
      },
      setMockExamResult: (input) => run("setMockExamResult", input),
      studentsForTeacher: (teacherId) =>
        data.students.filter(
          (s) => s.teacherId === teacherId && s.status !== "archived"
        ),
      unassignedStudents: () =>
        data.students.filter((s) => isUnassignedActiveStudent(s)),
      lessonsForTeacher: (teacherId) =>
        data.lessons.filter((l) => l.teacherId === teacherId),
      lessonsForStudent: (studentId) =>
        data.lessons.filter((l) => l.studentIds.includes(studentId)),
      sectionsForTeacher: (teacherId) =>
        data.topicSections
          .filter((s) => s.teacherId === teacherId)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      topicsForTeacher: (teacherId) =>
        data.topics
          .filter((t) => t.teacherId === teacherId)
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")
          ),
      topicsForLessonCatalog: (teacherId) =>
        data.topics
          .filter(
            (t) =>
              t.status === "active" &&
              (t.teacherId === teacherId || t.libraryScope === "school")
          )
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")
          ),
      homeworksForTopic: (topicId) =>
        data.homeworks.filter(
          (h) =>
            h.topicId === topicId &&
            h.status !== "archived" &&
            isCatalogHomeworkPurpose(h.purpose)
        ),
      homeworksForTeacher: (teacherId) =>
        data.homeworks.filter(
          (h) =>
            h.teacherId === teacherId &&
            h.status !== "archived" &&
            isCatalogHomeworkPurpose(h.purpose)
        ),
      publishedHomeworksForTopic: (topicId) =>
        data.homeworks.filter(
          (h) =>
            h.topicId === topicId &&
            h.status === "published" &&
            isCatalogHomeworkPurpose(h.purpose)
        ),
      publishedHomeworksForTeacher: (teacherId) =>
        data.homeworks.filter(
          (h) =>
            h.teacherId === teacherId &&
            h.status === "published" &&
            isCatalogHomeworkPurpose(h.purpose)
        ),
      publishedHomeworksForLessonCatalog: (teacherId) =>
        data.homeworks.filter(
          (h) =>
            h.status === "published" &&
            isCatalogHomeworkPurpose(h.purpose) &&
            (h.teacherId === teacherId || h.libraryScope === "school")
        ),
      assignmentsForTeacher: (teacherId) =>
        data.homeworkAssignments.filter(
          (a) => a.teacherId === teacherId && a.sourceKind !== "theory" && a.sourceKind !== "intensive"
        ),
      assignmentsForStudent: (studentId) =>
        data.homeworkAssignments.filter(
          (a) =>
            a.studentId === studentId &&
            a.sourceKind !== "theory" &&
            a.sourceKind !== "intensive" &&
            a.status !== "withdrawn"
        ),
      theoriesForTeacher: (teacherId) =>
        data.theories.filter((t) => t.teacherId === teacherId),
      publishedTheoriesForTeacher: (teacherId) =>
        data.theories.filter(
          (t) =>
            t.status === "published" &&
            (t.teacherId === teacherId || t.libraryScope === "school")
        ),
      theoryAssignmentsForTeacher: (teacherId) =>
        data.theoryAssignments.filter((a) => a.teacherId === teacherId),
      theoryAssignmentsForStudent: (studentId) =>
        data.theoryAssignments.filter((a) => a.studentId === studentId),
      intensivesForTeacher: (teacherId) =>
        data.intensives.filter(
          (item) =>
            item.teacherId === teacherId ||
            (item.libraryScope === "school" && item.status === "published")
        ),
      intensiveAssignmentsForTeacher: (teacherId) =>
        data.intensiveAssignments.filter((item) => item.teacherId === teacherId),
      intensiveAssignmentsForStudent: (studentId) =>
        data.intensiveAssignments.filter((item) => item.studentId === studentId),
      attendancesForLesson: (lessonId) =>
        data.attendances.filter((a) => a.lessonId === lessonId),
  };

  return (
    <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>
  );
}

export function useDemoStore() {
  const ctx = useContext(DemoStoreContext);
  if (!ctx) {
    throw new Error("useDemoStore must be used within DemoStoreProvider");
  }
  return ctx;
}
