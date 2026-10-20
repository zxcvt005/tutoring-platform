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
  cabinetHomeForRole,
  type AuthFeatures,
  type BootstrapAuth,
} from "@/lib/store/api-client";
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
  Topic,
  TopicSection,
} from "@/lib/types";

type AssignHomeworkInput = {
  homeworkId: string;
  topicId: string;
  teacherId: string;
  studentIds: string[];
  lessonId?: string;
  dueAt?: string;
};

type CompleteLessonInput = {
  lessonId: string;
  topicId: string;
  attendances: { studentId: string; status: AttendanceStatus }[];
  homeworkAssign?: {
    homeworkId: string;
    studentIds: string[];
    dueAt?: string;
  };
};

type OkResult = { ok: boolean; error?: string; created?: number };

type DemoStoreValue = {
  data: DemoData;
  ready: boolean;
  auth: BootstrapAuth | null;
  features: AuthFeatures | null;
  demoLoginEnabled: boolean;
  logout: () => Promise<void>;
  setCurrentTeacherId: (id: string) => void;
  setDirekciyaTeacherId: (id: string) => void;
  setCurrentStudentId: (id: string) => void;
  resetDemo: () => void;
  upsertTeacher: (teacher: Omit<Teacher, "id"> & { id?: string }) => void;
  deleteTeacher: (id: string) => void;
  upsertStudent: (student: Omit<Student, "id"> & { id?: string }) => void;
  deleteStudent: (id: string) => void;
  upsertLesson: (
    lesson: Omit<Lesson, "id"> & { id?: string }
  ) => Promise<OkResult>;
  deleteLesson: (id: string) => void;
  completeLesson: (input: CompleteLessonInput) => Promise<OkResult>;
  setAttendance: (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus
  ) => void;
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
    answers: StudentAnswer[]
  ) => Promise<OkResult>;
  submitHomeworkAssignment: (
    id: string,
    answers: StudentAnswer[]
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
  studentsForTeacher: (teacherId: string) => Student[];
  unassignedStudents: () => Student[];
  lessonsForTeacher: (teacherId: string) => Lesson[];
  lessonsForStudent: (studentId: string) => Lesson[];
  sectionsForTeacher: (teacherId: string) => TopicSection[];
  topicsForTeacher: (teacherId: string) => Topic[];
  homeworksForTopic: (topicId: string) => Homework[];
  publishedHomeworksForTopic: (topicId: string) => Homework[];
  assignmentsForTeacher: (teacherId: string) => HomeworkAssignment[];
  assignmentsForStudent: (studentId: string) => HomeworkAssignment[];
  attendancesForLesson: (lessonId: string) => Attendance[];
};

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

const EMPTY_DATA: DemoData = {
  version: 5,
  teachers: [],
  students: [],
  lessons: [],
  attendances: [],
  topicSections: [],
  topics: [],
  homeworks: [],
  homeworkAssignments: [],
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
    pathname?.startsWith("/setup")
  );
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<DemoData>(EMPTY_DATA);
  const [auth, setAuth] = useState<BootstrapAuth | null>(null);
  const [features, setFeatures] = useState<AuthFeatures | null>(null);
  const [ready, setReady] = useState(false);
  const [filterTeacherId, setFilterTeacherId] = useState("t1");
  const [filterStudentId, setFilterStudentId] = useState("s1");

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
    (async () => {
      try {
        const feats = await apiFeatures();
        if (cancelled) return;
        setFeatures(feats);

        if (isPublicAuthPath(pathname)) {
          if (!cancelled) setReady(true);
          return;
        }

        const role = roleFromPath(pathname);
        let me = await apiMe();

        if (!me) {
          if (feats.needsBootstrap) {
            router.replace("/setup");
            return;
          }
          if (feats.demoLogin) {
            await apiDemoLogin({
              role,
              teacherId: filterTeacherId,
              studentId: filterStudentId,
            });
            me = await apiMe();
          } else {
            const next = encodeURIComponent(pathname || "/");
            router.replace(`/login?next=${next}`);
            return;
          }
        }

        const meRole = (me as { role?: string } | null)?.role;
        if (feats.demoLogin) {
          const needSwitch =
            !me ||
            (role === "director" && meRole !== "director") ||
            (role === "teacher" && meRole !== "teacher") ||
            (role === "student" && meRole !== "student");
          if (needSwitch) {
            await apiDemoLogin({
              role,
              teacherId: filterTeacherId,
              studentId: filterStudentId,
            });
          }
        } else if (meRole && meRole !== role) {
          router.replace(
            cabinetHomeForRole(
              meRole as "director" | "teacher" | "student"
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
              : "Нет связи с API/PostgreSQL. См. docs/local-run.md"
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, filterTeacherId, filterStudentId, reload, router]);

  const run = useCallback(
    async (action: string, payload?: unknown, idem?: string): Promise<OkResult> => {
      try {
        const result = await apiPlatform<{ created?: number }>(
          action,
          payload,
          idem
        );
        await reload();
        return { ok: true, created: result.created };
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
      logout,
      setCurrentTeacherId,
      setDirekciyaTeacherId,
      setCurrentStudentId,
      resetDemo: () => {
        toast.message(
          "Для сброса демо выполните: npm run db:seed, затем обновите страницу"
        );
      },
      upsertTeacher: (teacher) => {
        void run("upsertTeacher", teacher);
      },
      deleteTeacher: (id) => {
        void run("deleteTeacher", { id });
      },
      upsertStudent: (student) => {
        void run("upsertStudent", student);
      },
      deleteStudent: (id) => {
        void run("deleteStudent", { id });
      },
      upsertLesson: (lesson) => run("upsertLesson", lesson),
      deleteLesson: (id) => {
        void run("deleteLesson", { id });
      },
      completeLesson: async (input) => {
        const r = await run("completeLesson", input);
        if (r.ok) toast.success("Занятие проведено");
        return r;
      },
      setAttendance: (lessonId, studentId, status) => {
        void run("setAttendance", { lessonId, studentId, status });
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
      saveHomeworkDraft: async (id, answers) => {
        const r = await run("saveHomeworkDraft", { id, answers });
        if (r.ok) toast.success("Черновик сохранён");
        return r;
      },
      submitHomeworkAssignment: async (id, answers) => {
        const r = await run(
          "submitHomeworkAssignment",
          { id, answers },
          `submit-${id}-${Date.now()}`
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
        data.homeworks.filter((h) => h.topicId === topicId),
      publishedHomeworksForTopic: (topicId) =>
        data.homeworks.filter(
          (h) => h.topicId === topicId && h.status === "published"
        ),
      assignmentsForTeacher: (teacherId) =>
        data.homeworkAssignments.filter((a) => a.teacherId === teacherId),
      assignmentsForStudent: (studentId) =>
        data.homeworkAssignments.filter((a) => a.studentId === studentId),
      attendancesForLesson: (lessonId) =>
        data.attendances.filter((a) => a.lessonId === lessonId),
    }),
    [
      data,
      ready,
      auth,
      features,
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
