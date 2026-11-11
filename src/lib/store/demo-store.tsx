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
  skipped?: number;
  id?: string;
  archived?: boolean;
  testAssignmentId?: string | null;
  status?: string;
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
  deleteStudent: (id: string) => void;
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
    activeFrom?: string;
    activeUntil?: string;
  }) => Promise<OkResult>;
  deleteLesson: (id: string) => void;
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
  saveTopic: (
    topic: Omit<Topic, "id" | "sortOrder" | "sectionId"> & {
      id?: string;
      sectionId?: string | null;
      sortOrder?: number;
    }
  ) => Promise<OkResult>;
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
  deleteTopic: (id: string) => void;
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
  deleteHomeworkAssignment: (id: string) => void;
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
  homeworksForTopic: (topicId: string) => Homework[];
  homeworksForTeacher: (teacherId: string) => Homework[];
  publishedHomeworksForTopic: (topicId: string) => Homework[];
  publishedHomeworksForTeacher: (teacherId: string) => Homework[];
  assignmentsForTeacher: (teacherId: string) => HomeworkAssignment[];
  assignmentsForStudent: (studentId: string) => HomeworkAssignment[];
  theoriesForTeacher: (teacherId: string) => TheoryMaterial[];
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
  intensives: [],
  intensiveAssignments: [],
  mockExams: [],
  mockExamResults: [],
  tariffs: [],
  tariffAssignments: [],
  payments: [],
  products: [],
  availableProductSlugs: [],
  currentTeacherId: "",
  direkciyaTeacherId: "",
  currentStudentId: "",
};

function newClientId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
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

  const reload = useCallback(async () => {
    const boot = await apiBootstrap();
    setData(boot.data);
    setAuth(boot.auth);
    return boot;
  }, []);

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

        if (!cancelled) await reload();
      } catch (e) {
        console.error(e);
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
  }, [bootKey, enqueueBoot, reload, router]);

  const run = useCallback(
    async (action: string, payload?: unknown, idem?: string): Promise<OkResult> => {
      try {
        const result = await apiPlatform<{
          created?: number;
          skipped?: number;
          id?: string;
          archived?: boolean;
          testAssignmentId?: string | null;
          status?: string;
        }>(action, payload, idem);
        await reload();
        return {
          ok: true,
          created: result.created,
          skipped: result.skipped,
          id: result.id,
          archived: result.archived,
          testAssignmentId: result.testAssignmentId,
          status: result.status,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Ошибка сервера";
        toast.error(message);
        return { ok: false, error: message };
      }
    },
    [reload]
  );

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
      upsertStudent: (student) => run("upsertStudent", student),
      deleteStudent: (id) => {
        void run("deleteStudent", { id });
      },
      archiveStudent: (input) => run("archiveStudent", input),
      restoreStudent: (id) => run("restoreStudent", { id }),
      upsertLesson: (lesson) => run("upsertLesson", lesson),
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
      deleteLesson: (id) => {
        void run("deleteLesson", { id });
      },
      completeLesson: async (input) => {
        const r = await run("completeLesson", input);
        if (r.ok) toast.success("Занятие проведено");
        return r;
      },
      setAttendance: (lessonId, studentId, status) =>
        run("setAttendance", { lessonId, studentId, status }),
      resetLessonConduct: (lessonId) =>
        run("resetLessonConduct", { lessonId }),
      setLessonTopic: (lessonId, title, topicId) =>
        run("setLessonTopic", { lessonId, title, topicId: topicId ?? null }),
      setLessonTopics: (lessonId, topics) =>
        run("setLessonTopics", { lessonId, topics }),
      saveTopic: (topic) => {
        const id = topic.id ?? newClientId("tp");
        return run("upsertTopic", { ...topic, id });
      },
      upsertTopicSection: (section) => {
        const id = section.id ?? newClientId("sec");
        void run("upsertTopicSection", { ...section, id });
        return id;
      },
      deleteTopicSection: (id, moveTopicsTo) =>
        run("deleteTopicSection", { id, moveTopicsTo }),
      reorderTopicSections: (teacherId, orderedIds) => {
        void run("reorderTopicSections", { teacherId, orderedIds });
      },
      upsertTopic: (topic) => {
        const id = topic.id ?? newClientId("tp");
        void run("upsertTopic", { ...topic, id });
        return id;
      },
      deleteTopic: (id) => {
        void run("deleteTopic", { id });
      },
      moveTopic: (topicId, sectionId, sortOrder) => {
        void run("moveTopic", { topicId, sectionId, sortOrder });
      },
      reorderTopics: (teacherId, sectionId, orderedIds) => {
        void run("reorderTopics", { teacherId, sectionId, orderedIds });
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
        if (r.ok) toast.success("Тест перемещён в архив");
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
          toast.success(`Назначено: ${r.created ?? 0}`);
        }
        return { ...r, created: r.created ?? 0 };
      },
      upsertHomeworkAssignment: () => {
        toast.message("Используйте сдачу или проверку задания");
      },
      saveHomeworkDraft: async (id, answers, attemptNumber = 1, options) => {
        const r = await run("saveHomeworkDraft", {
          id,
          answers,
          attemptNumber,
        });
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
      deleteHomeworkAssignment: (id) => {
        void run("deleteHomeworkAssignment", { id });
      },
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
