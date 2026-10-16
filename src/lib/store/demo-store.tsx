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
import {
  findStudentScheduleConflict,
  uniqueStudentIds,
} from "@/lib/schedule";
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
  TopicSection,
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
    topicId: string;
    attendances: { studentId: string; status: AttendanceStatus }[];
  }) => { ok: boolean; error?: string };
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
  ) => { ok: boolean; error?: string };
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
  upsertHomeworkAssignment: (
    a: Omit<HomeworkAssignment, "id"> & { id?: string }
  ) => void;
  deleteHomeworkAssignment: (id: string) => void;
  studentsForTeacher: (teacherId: string) => Student[];
  unassignedStudents: () => Student[];
  lessonsForTeacher: (teacherId: string) => Lesson[];
  sectionsForTeacher: (teacherId: string) => TopicSection[];
  topicsForTeacher: (teacherId: string) => Topic[];
  homeworksForTopic: (topicId: string) => Homework[];
  assignmentsForTeacher: (teacherId: string) => HomeworkAssignment[];
  assignmentsForStudent: (studentId: string) => HomeworkAssignment[];
  attendancesForLesson: (lessonId: string) => Attendance[];
};

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

const EMPTY_DATA: DemoData = {
  version: 3,
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

function nextSortOrder(
  items: { sortOrder: number }[]
): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.sortOrder)) + 1;
}

function applyOrder<T extends { id: string; sortOrder: number }>(
  items: T[],
  orderedIds: string[]
): T[] {
  const map = new Map(items.map((i) => [i.id, i]));
  const ordered: T[] = [];
  orderedIds.forEach((id, index) => {
    const item = map.get(id);
    if (item) {
      ordered.push({ ...item, sortOrder: index });
      map.delete(id);
    }
  });
  const rest = [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  rest.forEach((item, i) => {
    ordered.push({ ...item, sortOrder: ordered.length + i });
  });
  return ordered;
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DemoData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);

  useEffect(() => {
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

  const patch = useCallback((fn: (prev: DemoData) => DemoData) => {
    setData((prev) => {
      const next = fn(prev);
      const result = saveDemoData(next);
      if (!result.ok) {
        toast.error(result.error || "Ошибка сохранения");
      }
      return next;
    });
  }, []);

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
        lessons: d.lessons.map((l) => ({
          ...l,
          studentIds: l.studentIds.filter((sid) => sid !== id),
        })),
        attendances: d.attendances.filter((a) => a.studentId !== id),
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
      const draft: Lesson = {
        ...lesson,
        id,
        studentIds: uniqueStudentIds(lesson.studentIds),
      };
      let error: string | undefined;
      patch((d) => {
        if (draft.studentIds.length === 0) {
          error = "Добавьте хотя бы одного ученика";
          return d;
        }
        if (new Date(draft.endsAt) <= new Date(draft.startsAt)) {
          error = "Конец занятия должен быть позже начала";
          return d;
        }
        const conflict = findStudentScheduleConflict(d.lessons, draft);
        if (conflict) {
          const name =
            d.students.find((s) => s.id === conflict.studentId)?.fullName ??
            "ученик";
          error = `Конфликт: ${name} уже в другом занятии в это время`;
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
      topicId: string;
      attendances: { studentId: string; status: AttendanceStatus }[];
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
        const participantIds = uniqueStudentIds(lesson.studentIds);
        if (participantIds.length === 0) {
          error = "У занятия нет учеников";
          return d;
        }
        const byStudent = new Map(
          input.attendances.map((a) => [a.studentId, a.status])
        );
        for (const sid of participantIds) {
          if (!byStudent.has(sid)) {
            error = "Укажите посещаемость для всех участников";
            return d;
          }
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
          (a) => a.lessonId !== input.lessonId
        );
        for (const sid of participantIds) {
          attendances.push({
            lessonId: input.lessonId,
            studentId: sid,
            status: byStudent.get(sid)!,
          });
        }
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

  const upsertTopicSection = useCallback(
    (
      section: Omit<TopicSection, "id" | "sortOrder"> & {
        id?: string;
        sortOrder?: number;
      }
    ) => {
      const id = section.id ?? newId("sec");
      patch((d) => {
        const exists = d.topicSections.some((s) => s.id === id);
        const sortOrder =
          section.sortOrder ??
          (exists
            ? (d.topicSections.find((s) => s.id === id)?.sortOrder ?? 0)
            : nextSortOrder(
                d.topicSections.filter((s) => s.teacherId === section.teacherId)
              ));
        const next: TopicSection = {
          id,
          teacherId: section.teacherId,
          title: section.title,
          sortOrder,
        };
        return {
          ...d,
          topicSections: exists
            ? d.topicSections.map((s) => (s.id === id ? next : s))
            : [...d.topicSections, next],
        };
      });
      return id;
    },
    [patch]
  );

  const deleteTopicSection = useCallback(
    (id: string, moveTopicsTo: string | null) => {
      let error: string | undefined;
      patch((d) => {
        const section = d.topicSections.find((s) => s.id === id);
        if (!section) {
          error = "Раздел не найден";
          return d;
        }
        if (moveTopicsTo) {
          const target = d.topicSections.find((s) => s.id === moveTopicsTo);
          if (!target || target.teacherId !== section.teacherId) {
            error = "Нельзя перенести темы в этот раздел";
            return d;
          }
        }
        const targetTopics = d.topics.filter(
          (t) =>
            t.teacherId === section.teacherId &&
            (moveTopicsTo
              ? t.sectionId === moveTopicsTo
              : t.sectionId == null)
        );
        let cursor = nextSortOrder(targetTopics);
        const topics = d.topics.map((t) => {
          if (t.sectionId !== id) return t;
          return { ...t, sectionId: moveTopicsTo, sortOrder: cursor++ };
        });
        return {
          ...d,
          topicSections: d.topicSections.filter((s) => s.id !== id),
          topics,
        };
      });
      if (error) {
        toast.error(error);
        return { ok: false, error };
      }
      toast.success("Раздел удалён, темы сохранены");
      return { ok: true };
    },
    [patch]
  );

  const reorderTopicSections = useCallback(
    (teacherId: string, orderedIds: string[]) => {
      patch((d) => {
        const mine = d.topicSections.filter((s) => s.teacherId === teacherId);
        const others = d.topicSections.filter((s) => s.teacherId !== teacherId);
        return {
          ...d,
          topicSections: [...others, ...applyOrder(mine, orderedIds)],
        };
      });
    },
    [patch]
  );

  const upsertTopic = useCallback(
    (
      topic: Omit<Topic, "id" | "sortOrder" | "sectionId"> & {
        id?: string;
        sectionId?: string | null;
        sortOrder?: number;
      }
    ) => {
      const id = topic.id ?? newId("tp");
      patch((d) => {
        const exists = d.topics.some((t) => t.id === id);
        const sectionId = topic.sectionId === undefined ? null : topic.sectionId;
        const siblings = d.topics.filter(
          (t) =>
            t.teacherId === topic.teacherId &&
            (t.sectionId ?? null) === (sectionId ?? null) &&
            t.id !== id
        );
        const sortOrder =
          topic.sortOrder ??
          (exists
            ? (d.topics.find((t) => t.id === id)?.sortOrder ?? 0)
            : nextSortOrder(siblings));
        const next: Topic = {
          id,
          teacherId: topic.teacherId,
          sectionId: sectionId ?? null,
          title: topic.title,
          subject: topic.subject,
          description: topic.description,
          programNote: topic.programNote,
          status: topic.status,
          sortOrder,
        };
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

  const moveTopic = useCallback(
    (topicId: string, sectionId: string | null, sortOrder?: number) => {
      patch((d) => {
        const topic = d.topics.find((t) => t.id === topicId);
        if (!topic) return d;
        if (sectionId) {
          const sec = d.topicSections.find((s) => s.id === sectionId);
          if (!sec || sec.teacherId !== topic.teacherId) return d;
        }
        const siblings = d.topics.filter(
          (t) =>
            t.teacherId === topic.teacherId &&
            (t.sectionId ?? null) === sectionId &&
            t.id !== topicId
        );
        const order = sortOrder ?? nextSortOrder(siblings);
        return {
          ...d,
          topics: d.topics.map((t) =>
            t.id === topicId ? { ...t, sectionId, sortOrder: order } : t
          ),
        };
      });
    },
    [patch]
  );

  const reorderTopics = useCallback(
    (teacherId: string, sectionId: string | null, orderedIds: string[]) => {
      patch((d) => {
        const inSection = d.topics.filter(
          (t) =>
            t.teacherId === teacherId && (t.sectionId ?? null) === sectionId
        );
        const others = d.topics.filter(
          (t) =>
            !(t.teacherId === teacherId && (t.sectionId ?? null) === sectionId)
        );
        return {
          ...d,
          topics: [...others, ...applyOrder(inSection, orderedIds)],
        };
      });
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

  const sectionsForTeacher = useCallback(
    (teacherId: string) =>
      data.topicSections
        .filter((s) => s.teacherId === teacherId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [data.topicSections]
  );

  const topicsForTeacher = useCallback(
    (teacherId: string) =>
      data.topics
        .filter((t) => t.teacherId === teacherId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")),
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

  const attendancesForLesson = useCallback(
    (lessonId: string) => data.attendances.filter((a) => a.lessonId === lessonId),
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
      upsertTopicSection,
      deleteTopicSection,
      reorderTopicSections,
      upsertTopic,
      deleteTopic,
      moveTopic,
      reorderTopics,
      upsertHomework,
      deleteHomework,
      upsertHomeworkAssignment,
      deleteHomeworkAssignment,
      studentsForTeacher,
      unassignedStudents,
      lessonsForTeacher,
      sectionsForTeacher,
      topicsForTeacher,
      homeworksForTopic,
      assignmentsForTeacher,
      assignmentsForStudent,
      attendancesForLesson,
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
      upsertTopicSection,
      deleteTopicSection,
      reorderTopicSections,
      upsertTopic,
      deleteTopic,
      moveTopic,
      reorderTopics,
      upsertHomework,
      deleteHomework,
      upsertHomeworkAssignment,
      deleteHomeworkAssignment,
      studentsForTeacher,
      unassignedStudents,
      lessonsForTeacher,
      sectionsForTeacher,
      topicsForTeacher,
      homeworksForTopic,
      assignmentsForTeacher,
      assignmentsForStudent,
      attendancesForLesson,
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
