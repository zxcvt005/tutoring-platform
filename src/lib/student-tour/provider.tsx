"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DemoStoreContext,
  type DemoStoreValue,
} from "@/lib/store/demo-store";
import { StudentTourExtrasContext } from "@/lib/student-tour/extras";
import {
  STUDENT_TOUR_STORAGE_VERSION,
  STUDENT_TOUR_STUDENT_ID,
  STUDENT_TOUR_TEACHER_ID,
} from "@/lib/student-tour/constants";
import {
  clearStudentTourData,
  createFreshStudentTourState,
  readStudentTourState,
  writeStudentTourState,
} from "@/lib/student-tour/storage";
import { StudentTourPathProvider } from "@/lib/student-tour/paths";
import type {
  StudentTourExtras,
  StudentTourTrainerResult,
} from "@/lib/student-tour/types";
import { isUnassignedActiveStudent } from "@/lib/students/unassigned";
import type {
  DemoData,
  HomeworkAssignment,
  Student,
} from "@/lib/types";

/** Стабильный placeholder до client-hydrate — без Date.now(), чтобы не ломать SSR. */
const TOUR_BOOTSTRAP_DATA: DemoData = {
  version: 6,
  teachers: [
    {
      id: STUDENT_TOUR_TEACHER_ID,
      fullName: "Елена Волкова",
      avatarInitials: "ЕВ",
      subjects: ["Физика"],
      specializations: [],
      status: "active",
      defaultDurationMin: 60,
      workDays: [1, 2, 3, 4, 5],
      workIntervals: [{ start: "15:00", end: "21:00" }],
    },
  ],
  students: [
    {
      id: STUDENT_TOUR_STUDENT_ID,
      fullName: "Артём",
      grade: "11",
      status: "active",
      teacherId: STUDENT_TOUR_TEACHER_ID,
    },
  ],
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
  currentTeacherId: STUDENT_TOUR_TEACHER_ID,
  direkciyaTeacherId: STUDENT_TOUR_TEACHER_ID,
  currentStudentId: STUDENT_TOUR_STUDENT_ID,
};

const TOUR_BOOTSTRAP_EXTRAS: StudentTourExtras = {
  calls: [],
  notifications: [],
  trainerHistory: [],
};

const ok = (): { ok: true } => ({ ok: true });
const blocked = (message: string) => {
  toast.message(message);
  return { ok: false as const, error: message };
};

function selectors(data: DemoData): Pick<
  DemoStoreValue,
  | "studentsForTeacher"
  | "unassignedStudents"
  | "lessonsForTeacher"
  | "lessonsForStudent"
  | "sectionsForTeacher"
  | "topicsForTeacher"
  | "homeworksForTopic"
  | "homeworksForTeacher"
  | "publishedHomeworksForTopic"
  | "publishedHomeworksForTeacher"
  | "assignmentsForTeacher"
  | "assignmentsForStudent"
  | "theoriesForTeacher"
  | "theoryAssignmentsForTeacher"
  | "theoryAssignmentsForStudent"
  | "intensivesForTeacher"
  | "intensiveAssignmentsForTeacher"
  | "intensiveAssignmentsForStudent"
  | "attendancesForLesson"
> {
  return {
    studentsForTeacher: (teacherId) =>
      data.students.filter((s) => s.teacherId === teacherId),
    unassignedStudents: () =>
      data.students.filter((s) => isUnassignedActiveStudent(s)),
    lessonsForTeacher: (teacherId) =>
      data.lessons.filter((l) => l.teacherId === teacherId),
    lessonsForStudent: (studentId) =>
      data.lessons.filter((l) => l.studentIds.includes(studentId)),
    sectionsForTeacher: (teacherId) =>
      data.topicSections.filter((s) => s.teacherId === teacherId),
    topicsForTeacher: (teacherId) =>
      data.topics.filter((t) => t.teacherId === teacherId),
    homeworksForTopic: (topicId) =>
      data.homeworks.filter((h) => h.topicId === topicId),
    homeworksForTeacher: (teacherId) =>
      data.homeworks.filter((h) => h.teacherId === teacherId),
    publishedHomeworksForTopic: (topicId) =>
      data.homeworks.filter(
        (h) => h.topicId === topicId && h.status === "published"
      ),
    publishedHomeworksForTeacher: (teacherId) =>
      data.homeworks.filter(
        (h) => h.teacherId === teacherId && h.status === "published"
      ),
    assignmentsForTeacher: (teacherId) =>
      data.homeworkAssignments.filter((a) => a.teacherId === teacherId),
    assignmentsForStudent: (studentId) =>
      data.homeworkAssignments.filter(
        (a) =>
          a.studentId === studentId && (a.sourceKind ?? "homework") === "homework"
      ),
    theoriesForTeacher: (teacherId) =>
      data.theories.filter((t) => t.teacherId === teacherId),
    theoryAssignmentsForTeacher: (teacherId) =>
      data.theoryAssignments.filter((a) => a.teacherId === teacherId),
    theoryAssignmentsForStudent: (studentId) =>
      data.theoryAssignments.filter((a) => a.studentId === studentId),
    intensivesForTeacher: (teacherId) =>
      data.intensives.filter((i) => i.teacherId === teacherId),
    intensiveAssignmentsForTeacher: (teacherId) =>
      data.intensiveAssignments.filter((a) => a.teacherId === teacherId),
    intensiveAssignmentsForStudent: (studentId) =>
      data.intensiveAssignments.filter((a) => a.studentId === studentId),
    attendancesForLesson: (lessonId) =>
      data.attendances.filter((a) => a.lessonId === lessonId),
  };
}

function markAssignmentCompleted(
  item: HomeworkAssignment
): HomeworkAssignment {
  const maxScore = item.maxScore ?? item.testSnapshot?.maxScore ?? 10;
  const score = item.score ?? Math.round(maxScore * 0.85);
  return {
    ...item,
    status: "completed",
    completedAt: new Date().toISOString(),
    attempt1Percent: item.attempt1Percent ?? 85,
    attempt2Percent: item.attempt2Percent ?? null,
    score,
    maxScore,
    missedNextLesson: false,
    revealKeys: false,
    answers: undefined,
    attempt1Answers: undefined,
    attempt2Answers: undefined,
    questionOutcomes: undefined,
  };
}

export function StudentTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState<DemoData>(TOUR_BOOTSTRAP_DATA);
  const [extras, setExtras] = useState<StudentTourExtras>(TOUR_BOOTSTRAP_EXTRAS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStudentTourState();
    setData(stored.data);
    setExtras(stored.extras);
    setHydrated(true);
  }, []);

  const persistAll = useCallback(
    (nextData: DemoData, nextExtras: StudentTourExtras) => {
      setData(nextData);
      setExtras(nextExtras);
      writeStudentTourState({
        version: STUDENT_TOUR_STORAGE_VERSION,
        data: nextData,
        extras: nextExtras,
      });
    },
    []
  );

  const persistData = useCallback(
    (next: DemoData) => {
      persistAll(next, extras);
    },
    [extras, persistAll]
  );

  const recordTrainerResult = useCallback(
    (result: StudentTourTrainerResult) => {
      const nextExtras = {
        ...extras,
        trainerHistory: [result, ...extras.trainerHistory].slice(0, 20),
      };
      persistAll(data, nextExtras);
    },
    [data, extras, persistAll]
  );

  const value = useMemo<DemoStoreValue>(() => {
    const noopMsg = "В демонстрационном режиме это действие недоступно";
    return {
      data,
      ready: hydrated,
      auth: {
        userId: "tour_user_artem",
        role: "student",
        fullName: data.students[0]?.fullName ?? "Артём",
        email: "artem.demo@neodin.local",
        studentId: data.currentStudentId,
        teacherId: null,
        organizationId: "tour_org_neodin",
        impersonation: null,
      },
      features: {
        demoLogin: false,
        demoAccounts: [],
        production: true,
        needsBootstrap: false,
      },
      demoLoginEnabled: false,
      reload: async () => undefined,
      logout: async () => {
        clearStudentTourData();
        const reset = createFreshStudentTourState();
        setData(reset.data);
        setExtras(reset.extras);
        router.push("/");
      },
      setCurrentTeacherId: () => undefined,
      setDirekciyaTeacherId: () => undefined,
      setCurrentStudentId: () => undefined,
      resetDemo: () => {
        const reset = createFreshStudentTourState();
        persistAll(reset.data, reset.extras);
        toast.success("Демо-данные сброшены");
      },
      upsertTeacher: () => undefined,
      deleteTeacher: () => undefined,
      upsertStudent: async (student) => {
        const id = student.id ?? data.currentStudentId;
        persistData({
          ...data,
          students: data.students.map((s) =>
            s.id === id ? ({ ...s, ...student, id } as Student) : s
          ),
        });
        toast.success("Профиль обновлён в демо");
        return ok();
      },
      deleteStudent: () => undefined,
      archiveStudent: async () => blocked(noopMsg),
      restoreStudent: async () => blocked(noopMsg),
      upsertLesson: async () => blocked(noopMsg),
      createRecurringSchedule: async () => blocked(noopMsg),
      deleteLesson: () => undefined,
      completeLesson: async () => blocked(noopMsg),
      setAttendance: async () => blocked(noopMsg),
      resetLessonConduct: async () => blocked(noopMsg),
      setLessonTopic: async () => blocked(noopMsg),
      setLessonTopics: async () => blocked(noopMsg),
      saveTopic: async () => blocked(noopMsg),
      upsertTopicSection: () => "",
      deleteTopicSection: async () => blocked(noopMsg),
      reorderTopicSections: () => undefined,
      upsertTopic: () => "",
      deleteTopic: async () => blocked(noopMsg),
      moveTopic: () => undefined,
      reorderTopics: () => undefined,
      upsertMaterialFolder: async () => blocked(noopMsg),
      deleteMaterialFolder: async () => blocked(noopMsg),
      moveMaterialFolder: async () => blocked(noopMsg),
      reorderMaterialFolders: async () => blocked(noopMsg),
      moveMaterialToFolder: async () => blocked(noopMsg),
      upsertHomework: async () => blocked(noopMsg),
      deleteHomework: async () => blocked(noopMsg),
      restoreHomework: async () => blocked(noopMsg),
      publishHomework: async () => blocked(noopMsg),
      assignHomework: async () => blocked(noopMsg),
      upsertHomeworkAssignment: () => undefined,
      saveHomeworkDraft: async () => blocked("Тесты в демо закрыты"),
      submitHomeworkAssignment: async (id) => {
        const current = data.homeworkAssignments.find((a) => a.id === id);
        if (!current) return blocked("Задание не найдено");
        if (current.status === "completed" || current.status === "reviewed") {
          return ok();
        }
        persistData({
          ...data,
          homeworkAssignments: data.homeworkAssignments.map((a) =>
            a.id === id ? markAssignmentCompleted(a) : a
          ),
        });
        toast.success("Задание отмечено выполненным в демо");
        return ok();
      },
      reviewHomeworkAssignment: async () => blocked(noopMsg),
      deleteHomeworkAssignment: () => undefined,
      upsertTheory: async () => blocked(noopMsg),
      deleteTheory: async () => blocked(noopMsg),
      assignTheory: async () => blocked(noopMsg),
      markTheoryViewed: async () => blocked("Теория в демо закрыта"),
      uploadTheoryFile: async () => blocked(noopMsg),
      removeTheoryFile: async () => blocked(noopMsg),
      upsertIntensive: async () => blocked(noopMsg),
      deleteIntensive: async () => blocked(noopMsg),
      assignIntensive: async () => blocked(noopMsg),
      uploadIntensiveFile: async () => blocked(noopMsg),
      removeIntensiveFile: async () => blocked(noopMsg),
      createMockExam: async () => blocked(noopMsg),
      updateMockExam: async () => blocked(noopMsg),
      deleteMockExam: async () => blocked(noopMsg),
      setMockExamResult: async () => blocked(noopMsg),
      ...selectors(data),
    };
  }, [data, hydrated, persistAll, persistData, router]);

  const extrasApi = useMemo(
    () => ({ extras, recordTrainerResult }),
    [extras, recordTrainerResult]
  );

  return (
    <StudentTourPathProvider active>
      <StudentTourExtrasContext.Provider value={extrasApi}>
        <DemoStoreContext.Provider value={value}>
          {children}
        </DemoStoreContext.Provider>
      </StudentTourExtrasContext.Provider>
    </StudentTourPathProvider>
  );
}
