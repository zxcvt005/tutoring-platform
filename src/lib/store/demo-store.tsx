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
import type {
  Assignment,
  Attendance,
  AttendanceStatus,
  DemoData,
  Group,
  Lesson,
  Result,
  Student,
  Teacher,
} from "@/lib/types";

type DemoStoreValue = {
  data: DemoData;
  ready: boolean;
  setCurrentTeacherId: (id: string) => void;
  resetDemo: () => void;
  // Teachers
  upsertTeacher: (teacher: Omit<Teacher, "id"> & { id?: string }) => void;
  deleteTeacher: (id: string) => void;
  // Students
  upsertStudent: (student: Omit<Student, "id"> & { id?: string }) => void;
  deleteStudent: (id: string) => void;
  // Groups
  upsertGroup: (group: Omit<Group, "id"> & { id?: string }) => void;
  deleteGroup: (id: string) => void;
  // Lessons
  upsertLesson: (lesson: Omit<Lesson, "id"> & { id?: string }) => void;
  deleteLesson: (id: string) => void;
  // Attendance
  setAttendance: (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus
  ) => void;
  // Assignments + results
  upsertAssignment: (
    assignment: Omit<Assignment, "id"> & { id?: string }
  ) => void;
  deleteAssignment: (id: string) => void;
  upsertResult: (result: Omit<Result, "id"> & { id?: string }) => void;
  // Filters
  studentsForTeacher: (teacherId: string) => Student[];
  groupsForTeacher: (teacherId: string) => Group[];
  lessonsForTeacher: (teacherId: string) => Lesson[];
  assignmentsForTeacher: (teacherId: string) => Assignment[];
  resultsForTeacher: (teacherId: string) => Result[];
  lessonStudents: (lesson: Lesson) => Student[];
};

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

function syncGroupMembership(
  students: Student[],
  groups: Group[],
  studentId: string,
  groupIds: string[]
): { students: Student[]; groups: Group[] } {
  const nextStudents = students.map((s) =>
    s.id === studentId ? { ...s, groupIds: [...groupIds] } : s
  );
  const nextGroups = groups.map((g) => {
    const shouldInclude = groupIds.includes(g.id);
    const has = g.studentIds.includes(studentId);
    if (shouldInclude && !has) {
      return { ...g, studentIds: [...g.studentIds, studentId] };
    }
    if (!shouldInclude && has) {
      return {
        ...g,
        studentIds: g.studentIds.filter((id) => id !== studentId),
      };
    }
    return g;
  });
  return { students: nextStudents, groups: nextGroups };
}

function syncStudentsFromGroup(
  students: Student[],
  groupId: string,
  studentIds: string[]
): Student[] {
  return students.map((s) => {
    const shouldInclude = studentIds.includes(s.id);
    const has = s.groupIds.includes(groupId);
    if (shouldInclude && !has) {
      return { ...s, groupIds: [...s.groupIds, groupId] };
    }
    if (!shouldInclude && has) {
      return { ...s, groupIds: s.groupIds.filter((id) => id !== groupId) };
    }
    return s;
  });
}

function ensureResultsForAssignment(
  results: Result[],
  assignment: Assignment
): Result[] {
  const existing = new Set(
    results
      .filter((r) => r.assignmentId === assignment.id)
      .map((r) => r.studentId)
  );
  const added: Result[] = [];
  for (const studentId of assignment.studentIds) {
    if (!existing.has(studentId)) {
      added.push({
        id: newId("r"),
        assignmentId: assignment.id,
        studentId,
        maxScore: assignment.maxScore,
        status: "pending",
      });
    }
  }
  const kept = results.filter(
    (r) =>
      r.assignmentId !== assignment.id ||
      assignment.studentIds.includes(r.studentId)
  );
  return [...kept, ...added];
}

const EMPTY_DATA: DemoData = {
  teachers: [],
  students: [],
  groups: [],
  lessons: [],
  attendances: [],
  assignments: [],
  results: [],
  currentTeacherId: "",
};

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  // Пустой старт на SSR/prerender — seed с Date() только на клиенте.
  const [data, setData] = useState<DemoData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Гидратация из localStorage / seed после монтирования (клиент).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- намеренная клиентская гидратация
    setData(loadDemoData());
    setReady(true);
  }, []);

  const commit = useCallback((updater: (prev: DemoData) => DemoData) => {
    setData((prev) => {
      const next = updater(prev);
      const result = saveDemoData(next);
      if (!result.ok) {
        toast.error("Не удалось записать в localStorage", {
          description: result.error,
        });
      }
      return next;
    });
  }, []);

  const setCurrentTeacherId = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, currentTeacherId: id }));
    },
    [commit]
  );

  const resetDemo = useCallback(() => {
    clearDemoStorage();
    const seed = createSeedData();
    setData(seed);
    saveDemoData(seed);
    toast.success("Демо-данные сброшены");
  }, []);

  const upsertTeacher = useCallback(
    (teacher: Omit<Teacher, "id"> & { id?: string }) => {
      commit((prev) => {
        const id = teacher.id ?? newId("t");
        const nextTeacher: Teacher = { ...teacher, id };
        const exists = prev.teachers.some((t) => t.id === id);
        return {
          ...prev,
          teachers: exists
            ? prev.teachers.map((t) => (t.id === id ? nextTeacher : t))
            : [...prev.teachers, nextTeacher],
        };
      });
    },
    [commit]
  );

  const deleteTeacher = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        teachers: prev.teachers.filter((t) => t.id !== id),
        currentTeacherId:
          prev.currentTeacherId === id
            ? (prev.teachers.find((t) => t.id !== id)?.id ?? "")
            : prev.currentTeacherId,
      }));
    },
    [commit]
  );

  const upsertStudent = useCallback(
    (student: Omit<Student, "id"> & { id?: string }) => {
      commit((prev) => {
        const id = student.id ?? newId("s");
        const nextStudent: Student = { ...student, id, groupIds: student.groupIds };
        const exists = prev.students.some((s) => s.id === id);
        const students = exists
          ? prev.students.map((s) => (s.id === id ? nextStudent : s))
          : [...prev.students, nextStudent];
        const synced = syncGroupMembership(
          students,
          prev.groups,
          id,
          nextStudent.groupIds
        );
        return { ...prev, students: synced.students, groups: synced.groups };
      });
    },
    [commit]
  );

  const deleteStudent = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        students: prev.students.filter((s) => s.id !== id),
        groups: prev.groups.map((g) => ({
          ...g,
          studentIds: g.studentIds.filter((sid) => sid !== id),
        })),
        attendances: prev.attendances.filter((a) => a.studentId !== id),
        results: prev.results.filter((r) => r.studentId !== id),
        assignments: prev.assignments.map((a) => ({
          ...a,
          studentIds: a.studentIds.filter((sid) => sid !== id),
        })),
      }));
    },
    [commit]
  );

  const upsertGroup = useCallback(
    (group: Omit<Group, "id"> & { id?: string }) => {
      commit((prev) => {
        const id = group.id ?? newId("g");
        const nextGroup: Group = { ...group, id, studentIds: group.studentIds };
        const exists = prev.groups.some((g) => g.id === id);
        const groups = exists
          ? prev.groups.map((g) => (g.id === id ? nextGroup : g))
          : [...prev.groups, nextGroup];
        const students = syncStudentsFromGroup(
          prev.students,
          id,
          nextGroup.studentIds
        );
        return { ...prev, groups, students };
      });
    },
    [commit]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== id),
        students: prev.students.map((s) => ({
          ...s,
          groupIds: s.groupIds.filter((gid) => gid !== id),
        })),
        lessons: prev.lessons.map((l) =>
          l.groupId === id ? { ...l, groupId: undefined } : l
        ),
        assignments: prev.assignments.map((a) =>
          a.groupId === id ? { ...a, groupId: undefined } : a
        ),
      }));
    },
    [commit]
  );

  const upsertLesson = useCallback(
    (lesson: Omit<Lesson, "id"> & { id?: string }) => {
      commit((prev) => {
        const id = lesson.id ?? newId("l");
        const nextLesson: Lesson = { ...lesson, id };
        const exists = prev.lessons.some((l) => l.id === id);
        return {
          ...prev,
          lessons: exists
            ? prev.lessons.map((l) => (l.id === id ? nextLesson : l))
            : [...prev.lessons, nextLesson],
        };
      });
    },
    [commit]
  );

  const deleteLesson = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        lessons: prev.lessons.filter((l) => l.id !== id),
        attendances: prev.attendances.filter((a) => a.lessonId !== id),
      }));
    },
    [commit]
  );

  const setAttendance = useCallback(
    (lessonId: string, studentId: string, status: AttendanceStatus) => {
      commit((prev) => {
        const idx = prev.attendances.findIndex(
          (a) => a.lessonId === lessonId && a.studentId === studentId
        );
        const row: Attendance = { lessonId, studentId, status };
        if (idx === -1) {
          return { ...prev, attendances: [...prev.attendances, row] };
        }
        const attendances = [...prev.attendances];
        attendances[idx] = row;
        return { ...prev, attendances };
      });
    },
    [commit]
  );

  const upsertAssignment = useCallback(
    (assignment: Omit<Assignment, "id"> & { id?: string }) => {
      commit((prev) => {
        const id = assignment.id ?? newId("a");
        const nextAssignment: Assignment = {
          ...assignment,
          id,
          studentIds: assignment.studentIds,
        };
        const exists = prev.assignments.some((a) => a.id === id);
        const assignments = exists
          ? prev.assignments.map((a) => (a.id === id ? nextAssignment : a))
          : [...prev.assignments, nextAssignment];
        const results = ensureResultsForAssignment(prev.results, nextAssignment);
        return { ...prev, assignments, results };
      });
    },
    [commit]
  );

  const deleteAssignment = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        assignments: prev.assignments.filter((a) => a.id !== id),
        results: prev.results.filter((r) => r.assignmentId !== id),
      }));
    },
    [commit]
  );

  const upsertResult = useCallback(
    (result: Omit<Result, "id"> & { id?: string }) => {
      commit((prev) => {
        const id = result.id ?? newId("r");
        const next: Result = { ...result, id };
        const exists = prev.results.some((r) => r.id === id);
        return {
          ...prev,
          results: exists
            ? prev.results.map((r) => (r.id === id ? next : r))
            : [...prev.results, next],
        };
      });
    },
    [commit]
  );

  const studentsForTeacher = useCallback(
    (teacherId: string) => {
      const groupIds = new Set(
        data.groups.filter((g) => g.teacherId === teacherId).map((g) => g.id)
      );
      return data.students.filter(
        (s) =>
          s.teacherId === teacherId ||
          s.groupIds.some((gid) => groupIds.has(gid))
      );
    },
    [data.groups, data.students]
  );

  const groupsForTeacher = useCallback(
    (teacherId: string) => data.groups.filter((g) => g.teacherId === teacherId),
    [data.groups]
  );

  const lessonsForTeacher = useCallback(
    (teacherId: string) =>
      data.lessons.filter((l) => l.teacherId === teacherId),
    [data.lessons]
  );

  const assignmentsForTeacher = useCallback(
    (teacherId: string) =>
      data.assignments.filter((a) => a.teacherId === teacherId),
    [data.assignments]
  );

  const resultsForTeacher = useCallback(
    (teacherId: string) => {
      const assignmentIds = new Set(
        data.assignments
          .filter((a) => a.teacherId === teacherId)
          .map((a) => a.id)
      );
      return data.results.filter((r) => assignmentIds.has(r.assignmentId));
    },
    [data.assignments, data.results]
  );

  const lessonStudents = useCallback(
    (lesson: Lesson) => {
      if (lesson.groupId) {
        const group = data.groups.find((g) => g.id === lesson.groupId);
        if (group) {
          return data.students.filter((s) => group.studentIds.includes(s.id));
        }
      }
      if (lesson.studentIds?.length) {
        return data.students.filter((s) => lesson.studentIds!.includes(s.id));
      }
      return [];
    },
    [data.groups, data.students]
  );

  const value = useMemo<DemoStoreValue>(
    () => ({
      data,
      ready,
      setCurrentTeacherId,
      resetDemo,
      upsertTeacher,
      deleteTeacher,
      upsertStudent,
      deleteStudent,
      upsertGroup,
      deleteGroup,
      upsertLesson,
      deleteLesson,
      setAttendance,
      upsertAssignment,
      deleteAssignment,
      upsertResult,
      studentsForTeacher,
      groupsForTeacher,
      lessonsForTeacher,
      assignmentsForTeacher,
      resultsForTeacher,
      lessonStudents,
    }),
    [
      data,
      ready,
      setCurrentTeacherId,
      resetDemo,
      upsertTeacher,
      deleteTeacher,
      upsertStudent,
      deleteStudent,
      upsertGroup,
      deleteGroup,
      upsertLesson,
      deleteLesson,
      setAttendance,
      upsertAssignment,
      deleteAssignment,
      upsertResult,
      studentsForTeacher,
      groupsForTeacher,
      lessonsForTeacher,
      assignmentsForTeacher,
      resultsForTeacher,
      lessonStudents,
    ]
  );

  return (
    <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>
  );
}

export function useDemoStore() {
  const ctx = useContext(DemoStoreContext);
  if (!ctx) {
    throw new Error("useDemoStore должен вызываться внутри DemoStoreProvider");
  }
  return ctx;
}
