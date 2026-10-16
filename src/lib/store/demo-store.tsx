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
import { toast } from "sonner";

import { clearDemoStorage, loadDemoData, saveDemoData } from "@/lib/demo/storage";
import { createSeedData } from "@/lib/demo/seed";
import { newId } from "@/lib/format";
import { findLessonConflict } from "@/lib/schedule";
import type {
  Attendance,
  AttendanceStatus,
  DemoData,
  Homework,
  HomeworkAssignment,
  HomeworkAssignmentStatus,
  Lesson,
  Student,
  Teacher,
  Topic,
} from "@/lib/types";

type DemoStoreValue = {
  data: DemoData;
  ready: boolean;
  setCurrentTeacherId: (id: string) => void;
  setDirekciyaTeacherId: (id: string) => void;
  resetDemo: () => void;
  upsertTeacher: (teacher: Omit<Teacher, "id"> & { id?: string }) => void;
  deleteTeacher: (id: string) => void;
  upsertStudent: (student: Omit<Student, "id"> & { id?: string }) => void;
  deleteStudent: (id: string) => void;
  upsertLesson: (
    lesson: Omit<Lesson, "id"> & { id?: string }
  ) => { ok: boolean; error?: string };
  deleteLesson: (id: string) => void;
  completeLesson: (input: {
    lessonId: string;
    attendance: AttendanceStatus;
    topicId: string;
  }) => { ok: boolean; error?: string };
  setAttendance: (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus
  ) => void;
  upsertTopic: (topic: Omit<Topic, "id"> & { id?: string }) => string;
  deleteTopic: (id: string) => void;
  upsertHomework: (hw: Omit<Homework, "id"> & { id?: string }) => string;
  deleteHomework: (id: string) => void;
  upsertHomeworkAssignment: (
    a: Omit<HomeworkAssignment, "id"> & { id?: string }
  ) => void;
  deleteHomeworkAssignment: (id: string) => void;
  studentsForTeacher: (teacherId: string) => Student[];
  unassignedStudents: () => Student[];
  lessonsForTeacher: (teacherId: string) => Lesson[];
  topicsForTeacher: (teacherId: string) => Topic[];
  homeworksForTopic: (topicId: string) => Homework[];
  assignmentsForTeacher: (teacherId: string) => HomeworkAssignment[];
  assignmentsForStudent: (studentId: string) => HomeworkAssignment[];
  attendanceForLesson: (lessonId: string) => Attendance | undefined;
};

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

const EMPTY_DATA: DemoData = {
  version: 2,
  teachers: [],
  students: [],
  lessons: [],
  attendances: [],
  topics: [],
  homeworks: [],
  homeworkAssignments: [],
  currentTeacherId: "",
  direkciyaTeacherId: "",
};

function refreshOverdue(
  list: HomeworkAssignment[]
): HomeworkAssignment[] {
  const now = Date.now();
  return list.map((a) => {
    if (a.status === "assigned" && new Date(a.dueAt).getTime() < now) {
      return { ...a, status: "overdue" as const };
    }
    return a;
  });
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DemoData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Клиентская гидратация из localStorage — намеренный setState после mount.
    const loaded = loadDemoData();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage bootstrap
    setData({
      ...loaded,
      homeworkAssignments: refreshOverdue(loaded.homeworkAssignments),
    });
    setReady(true);
  }, []);

  const persist = useCallback((next: DemoData) => {
    const result = saveDemoData(next);
    if (!result.ok) {
      toast.error(result.error || "Ошибка сохранения");
    }
    setData(next);
  }, []);

  const patch = useCallback(
    (fn: (prev: DemoData) => DemoData) => {
      setData((prev) => {
        const next = fn(prev);
        const result = saveDemoData(next);
        if (!result.ok) {
          toast.error(result.error || "Ошибка сохранения");
        }
        return next;
      });
    },
    []
  );

  const setCurrentTeacherId = useCallback(
    (id: string) => patch((d) => ({ ...d, currentTeacherId: id })),
    [patch]
  );

  const setDirekciyaTeacherId = useCallback(
    (id: string) => patch((d) => ({ ...d, direkciyaTeacherId: id })),
    [patch]
  );

  const resetDemo = useCallback(() => {
    clearDemoStorage();
    const seed = createSeedData();
    persist(seed);
    toast.success("Демо-данные восстановлены");
  }, [persist]);

  const upsertTeacher = useCallback(
    (teacher: Omit<Teacher, "id"> & { id?: string }) => {
      patch((d) => {
        const id = teacher.id ?? newId("t");
        const next: Teacher = { ...teacher, id };
        const exists = d.teachers.some((t) => t.id === id);
        return {
          ...d,
          teachers: exists
            ? d.teachers.map((t) => (t.id === id ? next : t))
            : [...d.teachers, next],
        };
      });
    },
    [patch]
  );

  const deleteTeacher = useCallback(
    (id: string) => {
      patch((d) => ({
        ...d,
        teachers: d.teachers.filter((t) => t.id !== id),
        students: d.students.map((s) =>
          s.teacherId === id ? { ...s, teacherId: "" } : s
        ),
        currentTeacherId:
          d.currentTeacherId === id
            ? (d.teachers.find((t) => t.id !== id)?.id ?? "")
            : d.currentTeacherId,
        direkciyaTeacherId:
          d.direkciyaTeacherId === id
            ? (d.teachers.find((t) => t.id !== id)?.id ?? "")
            : d.direkciyaTeacherId,
      }));
    },
    [patch]
  );

  const upsertStudent = useCallback(
    (student: Omit<Student, "id"> & { id?: string }) => {
      patch((d) => {
        const id = student.id ?? newId("s");
        const next: Student = { ...student, id };
        const exists = d.students.some((s) => s.id === id);
        return {
          ...d,
          students: exists
            ? d.students.map((s) => (s.id === id ? next : s))
            : [...d.students, next],
        };
      });
    },
    [patch]
  );

  const deleteStudent = useCallback(
    (id: string) => {
      patch((d) => ({
        ...d,
        students: d.students.filter((s) => s.id !== id),
        homeworkAssignments: d.homeworkAssignments.filter(
          (a) => a.studentId !== id
        ),
      }));
    },
    [patch]
  );

  const upsertLesson = useCallback(
    (lesson: Omit<Lesson, "id"> & { id?: string }) => {
      const id = lesson.id ?? newId("l");
      const draft: Lesson = { ...lesson, id };
      let error: string | undefined;
      patch((d) => {
        const conflict = findLessonConflict(d.lessons, draft);
        if (conflict) {
          error = "Пересечение с другим занятием этого преподавателя";
          return d;
        }
        if (new Date(draft.endsAt) <= new Date(draft.startsAt)) {
          error = "Конец занятия должен быть позже начала";
          return d;
        }
        const exists = d.lessons.some((l) => l.id === id);
        return {
          ...d,
          lessons: exists
            ? d.lessons.map((l) => (l.id === id ? draft : l))
            : [...d.lessons, draft],
        };
      });
      if (error) {
        toast.error(error);
        return { ok: false, error };
      }
      return { ok: true };
    },
    [patch]
  );

  const deleteLesson = useCallback(
    (id: string) => {
      patch((d) => ({
        ...d,
        lessons: d.lessons.filter((l) => l.id !== id),
        attendances: d.attendances.filter((a) => a.lessonId !== id),
      }));
    },
    [patch]
  );

  const setAttendance = useCallback(
    (lessonId: string, studentId: string, status: AttendanceStatus) => {
      patch((d) => {
        const idx = d.attendances.findIndex(
          (a) => a.lessonId === lessonId && a.studentId === studentId
        );
        const row: Attendance = { lessonId, studentId, status };
        if (idx >= 0) {
          const attendances = [...d.attendances];
          attendances[idx] = row;
          return { ...d, attendances };
        }
        return { ...d, attendances: [...d.attendances, row] };
      });
    },
    [patch]
  );

  const completeLesson = useCallback(
    (input: {
      lessonId: string;
      attendance: AttendanceStatus;
      topicId: string;
    }) => {
      let error: string | undefined;
      patch((d) => {
        const lesson = d.lessons.find((l) => l.id === input.lessonId);
        if (!lesson) {
          error = "Занятие не найдено";
          return d;
        }
        if (!input.topicId) {
          error = "Укажите пройденную тему";
          return d;
        }
        const topic = d.topics.find((t) => t.id === input.topicId);
        if (!topic || topic.teacherId !== lesson.teacherId) {
          error = "Тема не принадлежит этому преподавателю";
          return d;
        }
        const lessons = d.lessons.map((l) =>
          l.id === input.lessonId
            ? {
                ...l,
                status: "done" as const,
                topicId: input.topicId,
              }
            : l
        );
        const attendances = d.attendances.filter(
          (a) =>
            !(a.lessonId === input.lessonId && a.studentId === lesson.studentId)
        );
        attendances.push({
          lessonId: input.lessonId,
          studentId: lesson.studentId,
          status: input.attendance,
        });
        return { ...d, lessons, attendances };
      });
      if (error) {
        toast.error(error);
        return { ok: false, error };
      }
      toast.success("Занятие отмечено как проведённое");
      return { ok: true };
    },
    [patch]
  );

  const upsertTopic = useCallback(
    (topic: Omit<Topic, "id"> & { id?: string }) => {
      const id = topic.id ?? newId("tp");
      patch((d) => {
        const next: Topic = { ...topic, id };
        const exists = d.topics.some((t) => t.id === id);
        return {
          ...d,
          topics: exists
            ? d.topics.map((t) => (t.id === id ? next : t))
            : [...d.topics, next],
        };
      });
      return id;
    },
    [patch]
  );

  const deleteTopic = useCallback(
    (id: string) => {
      patch((d) => ({
        ...d,
        topics: d.topics.map((t) =>
          t.id === id ? { ...t, status: "archived" as const } : t
        ),
      }));
    },
    [patch]
  );

  const upsertHomework = useCallback(
    (hw: Omit<Homework, "id"> & { id?: string }) => {
      const id = hw.id ?? newId("hw");
      patch((d) => {
        const next: Homework = { ...hw, id };
        const exists = d.homeworks.some((h) => h.id === id);
        return {
          ...d,
          homeworks: exists
            ? d.homeworks.map((h) => (h.id === id ? next : h))
            : [...d.homeworks, next],
        };
      });
      return id;
    },
    [patch]
  );

  const deleteHomework = useCallback(
    (id: string) => {
      patch((d) => ({
        ...d,
        homeworks: d.homeworks.map((h) =>
          h.id === id ? { ...h, status: "archived" as const } : h
        ),
      }));
    },
    [patch]
  );

  const upsertHomeworkAssignment = useCallback(
    (a: Omit<HomeworkAssignment, "id"> & { id?: string }) => {
      patch((d) => {
        const id = a.id ?? newId("ha");
        let status: HomeworkAssignmentStatus = a.status;
        if (
          status === "assigned" &&
          new Date(a.dueAt).getTime() < Date.now()
        ) {
          status = "overdue";
        }
        const next: HomeworkAssignment = { ...a, id, status };
        const exists = d.homeworkAssignments.some((x) => x.id === id);
        return {
          ...d,
          homeworkAssignments: exists
            ? d.homeworkAssignments.map((x) => (x.id === id ? next : x))
            : [...d.homeworkAssignments, next],
        };
      });
    },
    [patch]
  );

  const deleteHomeworkAssignment = useCallback(
    (id: string) => {
      patch((d) => ({
        ...d,
        homeworkAssignments: d.homeworkAssignments.filter((a) => a.id !== id),
      }));
    },
    [patch]
  );

  const studentsForTeacher = useCallback(
    (teacherId: string) => data.students.filter((s) => s.teacherId === teacherId),
    [data.students]
  );

  const unassignedStudents = useCallback(
    () => data.students.filter((s) => !s.teacherId),
    [data.students]
  );

  const lessonsForTeacher = useCallback(
    (teacherId: string) => data.lessons.filter((l) => l.teacherId === teacherId),
    [data.lessons]
  );

  const topicsForTeacher = useCallback(
    (teacherId: string) => data.topics.filter((t) => t.teacherId === teacherId),
    [data.topics]
  );

  const homeworksForTopic = useCallback(
    (topicId: string) => data.homeworks.filter((h) => h.topicId === topicId),
    [data.homeworks]
  );

  const assignmentsForTeacher = useCallback(
    (teacherId: string) =>
      data.homeworkAssignments.filter((a) => a.teacherId === teacherId),
    [data.homeworkAssignments]
  );

  const assignmentsForStudent = useCallback(
    (studentId: string) =>
      data.homeworkAssignments.filter((a) => a.studentId === studentId),
    [data.homeworkAssignments]
  );

  const attendanceForLesson = useCallback(
    (lessonId: string) => data.attendances.find((a) => a.lessonId === lessonId),
    [data.attendances]
  );

  const value = useMemo<DemoStoreValue>(
    () => ({
      data,
      ready,
      setCurrentTeacherId,
      setDirekciyaTeacherId,
      resetDemo,
      upsertTeacher,
      deleteTeacher,
      upsertStudent,
      deleteStudent,
      upsertLesson,
      deleteLesson,
      completeLesson,
      setAttendance,
      upsertTopic,
      deleteTopic,
      upsertHomework,
      deleteHomework,
      upsertHomeworkAssignment,
      deleteHomeworkAssignment,
      studentsForTeacher,
      unassignedStudents,
      lessonsForTeacher,
      topicsForTeacher,
      homeworksForTopic,
      assignmentsForTeacher,
      assignmentsForStudent,
      attendanceForLesson,
    }),
    [
      data,
      ready,
      setCurrentTeacherId,
      setDirekciyaTeacherId,
      resetDemo,
      upsertTeacher,
      deleteTeacher,
      upsertStudent,
      deleteStudent,
      upsertLesson,
      deleteLesson,
      completeLesson,
      setAttendance,
      upsertTopic,
      deleteTopic,
      upsertHomework,
      deleteHomework,
      upsertHomeworkAssignment,
      deleteHomeworkAssignment,
      studentsForTeacher,
      unassignedStudents,
      lessonsForTeacher,
      topicsForTeacher,
      homeworksForTopic,
      assignmentsForTeacher,
      assignmentsForStudent,
      attendanceForLesson,
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
