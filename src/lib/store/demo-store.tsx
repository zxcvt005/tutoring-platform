"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  apiBootstrap,
  apiDemoLogin,
  apiFeatures,
  apiLogout,
  apiMe,
  apiPlatform,
  apiTheoryUploadFile,
  cabinetHomeForRole,
  type AuthFeatures,
  type BootstrapAuth,
} from "@/lib/store/api-client";
import {
  shouldDefaultDemoLogin,
  shouldSwitchDemoCabinet,
} from "@/lib/store/demo-session";
import type {
  Attendance,
  AttendanceStatus,
  DemoData,
  Homework,
  HomeworkAssignment,
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

type DemoStoreValue = {
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
  upsertHomework: (hw: Omit<Homework, "id"> & { id?: string }) => string;
  deleteHomework: (id: string) => void;
  publishHomework: (id: string) => Promise<OkResult>;
  assignHomework: (input: AssignHomeworkInput) => Promise<OkResult>;
  upsertHomeworkAssignment: (
    a: Omit<HomeworkAssignment, "id"> & { id?: string }
  ) => void;
  saveHomeworkDraft: (
    id: string,
    answers: StudentAnswer[],
    attemptNumber?: 1 | 2
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
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    testId?: string | null;
    publish?: boolean;
  }) => Promise<OkResult & { id?: string }>;
  deleteTheory: (id: string) => Promise<OkResult>;
  assignTheory: (input: {
    materialId: string;
    studentIds: string[];
  }) => Promise<OkResult>;
  markTheoryViewed: (id: string) => Promise<OkResult>;
  uploadTheoryFile: (materialId: string, file: File) => Promise<OkResult>;
  removeTheoryFile: (materialId: string, fileId: string) => Promise<OkResult>;
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
  attendancesForLesson: (lessonId: string) => Attendance[];
};

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

const EMPTY_DATA: DemoData = {
  version: 6,
  teachers: [],
  students: [],
  lessons: [],
  attendances: [],
  topicSections: [],
  topics: [],
  homeworks: [],
  homeworkAssignments: [],
  theories: [],
  theoryAssignments: [],
  tariffs: [],
  tariffAssignments: [],
  payments: [],
  currentTeacherId: "",
  direkciyaTeacherId: "",
  currentStudentId: "",
};

function roleFromPath(
  pathname: string | null
): "director" | "teacher" | "student" {
  if (pathname?.startsWith("/kafedra")) return "teacher";
  if (pathname?.startsWith("/auditoria")) return "student";
  return "director";
}

function newClientId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function isPublicAuthPath(pathname: string | null) {
  return (
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname === "/" ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/setup") ||
    pathname?.startsWith("/register")
  );
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<DemoData>(EMPTY_DATA);
  const [auth, setAuth] = useState<BootstrapAuth | null>(null);
  const [features, setFeatures] = useState<AuthFeatures | null>(null);
  const [ready, setReady] = useState(false);
  const [filterTeacherId, setFilterTeacherId] = useState("sch_t1");
  const [filterStudentId, setFilterStudentId] = useState("sch_s01");

  const reload = useCallback(async () => {
    const boot = await apiBootstrap();
    setData(boot.data);
    setAuth(boot.auth);
    return boot;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setAuth(null);
    setData(EMPTY_DATA);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const runId = `boot_${Math.random().toString(36).slice(2, 8)}`;
    const demoBoot = (step: string, extra?: Record<string, unknown>) => {
      console.log("[DEMO-BOOT]", runId, step, extra ?? {});
    };
    const timed = async <T,>(
      label: string,
      fn: () => Promise<T>,
      summarize?: (value: T) => Record<string, unknown>
    ): Promise<T> => {
      demoBoot(`${label}:start`);
      const started = performance.now();
      try {
        const value = await fn();
        demoBoot(`${label}:done`, {
          ms: Math.round(performance.now() - started),
          ...(summarize ? summarize(value) : { ok: true }),
        });
        return value;
      } catch (err) {
        console.error("[DEMO-BOOT]", runId, `${label}:error`, {
          ms: Math.round(performance.now() - started),
        }, err);
        throw err;
      }
    };
    demoBoot("effect:start", {
      pathname,
      filterTeacherId,
      filterStudentId,
      readyAtEffectStart: ready,
    });
    (async () => {
      try {
        const feats = await timed("apiFeatures", () => apiFeatures(), (value) => ({
          demoLogin: value.demoLogin,
          needsBootstrap: value.needsBootstrap,
          demoAccountCount: value.demoAccounts?.length ?? 0,
        }));
        if (cancelled) {
          demoBoot("abort-after-apiFeatures", { cancelled: true });
          return;
        }
        setFeatures(feats);

        if (isPublicAuthPath(pathname)) {
          if (!cancelled) {
            setReady(true);
            demoBoot("setReady(true)", { reason: "public-auth-path" });
          }
          return;
        }

        const role = roleFromPath(pathname);
        demoBoot("role-from-path", { pathRole: role });
        let me = await timed("apiMe", () => apiMe(), (value) => ({
          hasMe: Boolean(value),
          role: (value as { role?: string } | null)?.role ?? null,
          studentId: (value as { studentId?: string | null } | null)?.studentId ?? null,
          teacherId: (value as { teacherId?: string | null } | null)?.teacherId ?? null,
        }));

        if (!me) {
          if (feats.needsBootstrap) {
            demoBoot("redirect", { to: "/setup", reason: "needsBootstrap" });
            router.replace("/setup");
            return;
          }
          if (
            shouldDefaultDemoLogin({
              demoLoginEnabled: feats.demoLogin,
              hasSession: false,
            })
          ) {
            await timed(
              "apiDemoLogin:no-session",
              () =>
                apiDemoLogin({
                  role,
                  teacherId: filterTeacherId,
                  studentId: filterStudentId,
                }),
              (value) => ({
                role: value.role,
                studentId: value.studentId ?? null,
                teacherId: value.teacherId ?? null,
              })
            );
            me = await timed("apiMe:after-demo-login", () => apiMe(), (value) => ({
              hasMe: Boolean(value),
              role: (value as { role?: string } | null)?.role ?? null,
              studentId:
                (value as { studentId?: string | null } | null)?.studentId ??
                null,
              teacherId:
                (value as { teacherId?: string | null } | null)?.teacherId ??
                null,
            }));
          } else {
            const next = encodeURIComponent(pathname || "/");
            demoBoot("redirect", { to: "/login", reason: "demoLogin-disabled" });
            router.replace(`/login?next=${next}`);
            return;
          }
        }

        const meRole = (me as { role?: string } | null)?.role;
        const meTeacherId = (me as { teacherId?: string | null } | null)
          ?.teacherId;
        const meStudentId = (me as { studentId?: string | null } | null)
          ?.studentId;
        const needCabinetSwitch = shouldSwitchDemoCabinet({
          demoLoginEnabled: feats.demoLogin,
          hasSession: Boolean(me),
          pathRole: role,
          sessionRole: meRole,
        });
        demoBoot("identity-check", {
          pathRole: role,
          meRole: meRole ?? null,
          meStudentId: meStudentId ?? null,
          meTeacherId: meTeacherId ?? null,
          filterStudentId,
          filterTeacherId,
          needCabinetSwitch,
          sessionIsSourceOfTruth: Boolean(me) && !needCabinetSwitch,
        });
        if (needCabinetSwitch) {
          await timed(
            "apiDemoLogin:cabinet-switch",
            () =>
              apiDemoLogin({
                role,
                teacherId: filterTeacherId,
                studentId: filterStudentId,
              }),
            (value) => ({
              role: value.role,
              studentId: value.studentId ?? null,
              teacherId: value.teacherId ?? null,
            })
          );
        } else if (!feats.demoLogin && meRole && meRole !== role) {
          demoBoot("redirect", {
            reason: "role-mismatch",
            meRole,
            pathRole: role,
          });
          router.replace(
            cabinetHomeForRole(
              meRole as "director" | "teacher" | "student"
            )
          );
          return;
        }

        if (!cancelled) {
          await timed("reload/apiBootstrap", () => reload(), (boot) => ({
            authRole: boot.auth?.role ?? null,
            authStudentId: boot.auth?.studentId ?? null,
            authTeacherId: boot.auth?.teacherId ?? null,
          }));
        } else {
          demoBoot("skip-reload", { cancelled: true });
        }
      } catch (e) {
        console.error("[DEMO-BOOT]", runId, "effect:error", e);
        console.error(e);
        if (!cancelled) {
          toast.error(
            e instanceof Error
              ? e.message
              : "Нет связи с API/PostgreSQL. См. docs/local-run.md"
          );
        }
      } finally {
        demoBoot("finally", {
          cancelled,
          willSetReady: !cancelled,
          readyAtEffectStart: ready,
        });
        if (!cancelled) {
          setReady(true);
          demoBoot("setReady(true)", { reason: "effect-finally" });
        }
      }
    })();
    return () => {
      cancelled = true;
      demoBoot("cleanup", {
        reason: "effect-deps-or-unmount",
        pathname,
        filterTeacherId,
        filterStudentId,
      });
    };
  }, [pathname, filterTeacherId, filterStudentId, reload, router]);

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

  const value = useMemo<DemoStoreValue>(
    () => ({
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
      demoLoginEnabled: features?.demoLogin ?? false,
      reload,
      logout,
      setCurrentTeacherId,
      setDirekciyaTeacherId,
      setCurrentStudentId,
      resetDemo: () => {
        toast.message(
          "Обновить тестовую школу: в PowerShell выполните npm run db:seed:school (при ALLOW_TEST_SEED=1), затем обновите страницу. Или перезапустите start-local.bat без UMBA_SKIP_SEED."
        );
      },
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
      upsertHomework: (hw) => {
        const id = hw.id ?? newClientId("hw");
        void run("upsertHomework", { ...hw, id });
        return id;
      },
      deleteHomework: (id) => {
        void run("deleteHomework", { id });
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
      saveHomeworkDraft: async (id, answers, attemptNumber = 1) => {
        const r = await run("saveHomeworkDraft", {
          id,
          answers,
          attemptNumber,
        });
        if (r.ok) toast.success("Черновик сохранён");
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
      studentsForTeacher: (teacherId) =>
        data.students.filter((s) => s.teacherId === teacherId),
      unassignedStudents: () => data.students.filter((s) => !s.teacherId),
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
          (h) => h.topicId === topicId && h.purpose !== "theory"
        ),
      homeworksForTeacher: (teacherId) =>
        data.homeworks.filter(
          (h) => h.teacherId === teacherId && h.purpose !== "theory"
        ),
      publishedHomeworksForTopic: (topicId) =>
        data.homeworks.filter(
          (h) =>
            h.topicId === topicId &&
            h.status === "published" &&
            h.purpose !== "theory"
        ),
      publishedHomeworksForTeacher: (teacherId) =>
        data.homeworks.filter(
          (h) =>
            h.teacherId === teacherId &&
            h.status === "published" &&
            h.purpose !== "theory"
        ),
      assignmentsForTeacher: (teacherId) =>
        data.homeworkAssignments.filter(
          (a) => a.teacherId === teacherId && a.sourceKind !== "theory"
        ),
      assignmentsForStudent: (studentId) =>
        data.homeworkAssignments.filter(
          (a) => a.studentId === studentId && a.sourceKind !== "theory"
        ),
      theoriesForTeacher: (teacherId) =>
        data.theories.filter((t) => t.teacherId === teacherId),
      theoryAssignmentsForTeacher: (teacherId) =>
        data.theoryAssignments.filter((a) => a.teacherId === teacherId),
      theoryAssignmentsForStudent: (studentId) =>
        data.theoryAssignments.filter((a) => a.studentId === studentId),
      attendancesForLesson: (lessonId) =>
        data.attendances.filter((a) => a.lessonId === lessonId),
    }),
    [
      data,
      ready,
      auth,
      features,
      reload,
      logout,
      filterTeacherId,
      filterStudentId,
      setCurrentTeacherId,
      setDirekciyaTeacherId,
      setCurrentStudentId,
      run,
    ]
  );

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
