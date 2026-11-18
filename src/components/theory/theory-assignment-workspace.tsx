"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  filterTheoryCatalogForStudent,
  theoryCatalogEmptyHint,
  theoryDirectionOptionsForStudent,
} from "@/lib/theory/assign-catalog";
import { gradeLabel } from "@/lib/student-contacts";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Student } from "@/lib/types";

/**
 * Последовательное назначение теории: ученик → отфильтрованный каталог.
 * Если ученик уже известен (карточка занятия), шаг выбора пропускается.
 */
export function TheoryAssignmentWorkspace({
  lockedStudentId,
  lessonSubject,
  directionId: lockedDirectionId,
}: {
  lockedStudentId?: string | null;
  lessonSubject?: string | null;
  directionId?: string | null;
} = {}) {
  const {
    data,
    studentsForTeacher,
    publishedTheoriesForTeacher,
    theoryAssignmentsForTeacher,
    assignTheory,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const materials = publishedTheoriesForTeacher(teacherId);
  const assignments = theoryAssignmentsForTeacher(teacherId);
  const students = studentsForTeacher(teacherId).filter(
    (s) => s.status === "active"
  );

  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    lockedStudentId ?? null
  );
  const [directionId, setDirectionId] = useState<string>("");
  const [theoryQuery, setTheoryQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [busyMaterialId, setBusyMaterialId] = useState<string | null>(null);

  useEffect(() => {
    if (lockedStudentId) {
      setSelectedStudentId(lockedStudentId);
    }
  }, [lockedStudentId]);

  const selectedStudent: Student | null = useMemo(
    () =>
      selectedStudentId
        ? (students.find((s) => s.id === selectedStudentId) ??
          data.students.find((s) => s.id === selectedStudentId) ??
          null)
        : null,
    [selectedStudentId, students, data.students]
  );

  const directionOptions = useMemo(
    () =>
      selectedStudent
        ? theoryDirectionOptionsForStudent(
            selectedStudent,
            data.studentDirectionBalances ?? [],
            data.learningDirections ?? []
          )
        : [],
    [
      selectedStudent,
      data.studentDirectionBalances,
      data.learningDirections,
    ]
  );

  useEffect(() => {
    if (!selectedStudentId) {
      setDirectionId("");
      return;
    }
    if (lockedDirectionId) {
      setDirectionId(lockedDirectionId);
      return;
    }
    setDirectionId((prev) => {
      if (prev && directionOptions.some((d) => d.id === prev)) return prev;
      return directionOptions[0]?.id ?? "";
    });
  }, [selectedStudentId, lockedDirectionId, directionOptions]);

  const subjectCtx = useMemo(
    () => ({
      lessonSubject: lessonSubject ?? null,
      directionId: directionId || lockedDirectionId || null,
      directions: data.learningDirections,
    }),
    [lessonSubject, directionId, lockedDirectionId, data.learningDirections]
  );

  const catalog = useMemo(() => {
    if (!selectedStudent) return [];
    return filterTheoryCatalogForStudent(materials, data.materialFolders, {
      ...subjectCtx,
      studentGrade: selectedStudent.grade,
    });
  }, [selectedStudent, materials, data.materialFolders, subjectCtx]);

  const filteredCatalog = useMemo(() => {
    const q = theoryQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((m) => m.title.toLowerCase().includes(q));
  }, [catalog, theoryQuery]);

  const emptyHint = theoryCatalogEmptyHint({
    ...subjectCtx,
    student: selectedStudent,
  });

  const assignedMaterialIds = useMemo(() => {
    if (!selectedStudentId) return new Set<string>();
    return new Set(
      assignments
        .filter((a) => a.studentId === selectedStudentId)
        .map((a) => a.materialId)
    );
  }, [assignments, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return students
      .filter((s) => (q ? s.fullName.toLowerCase().includes(q) : true))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }, [students, studentQuery]);

  const assignmentRows = useMemo(() => {
    const q = assignmentFilter.trim().toLowerCase();
    return assignments
      .map((a) => {
        const material = materials.find((m) => m.id === a.materialId);
        const student = students.find((s) => s.id === a.studentId);
        return {
          ...a,
          materialTitle: material?.title ?? a.title ?? "Теория",
          libraryScope: material?.libraryScope,
          studentName: student?.fullName ?? "Ученик",
        };
      })
      .filter((row) =>
        q ? row.studentName.toLowerCase().includes(q) : true
      )
      .sort(
        (a, b) =>
          (b.assignedAt ?? "").localeCompare(a.assignedAt ?? "") ||
          a.materialTitle.localeCompare(b.materialTitle, "ru")
      );
  }, [assignments, materials, students, assignmentFilter]);

  async function assignOne(materialId: string) {
    if (!selectedStudentId) return;
    if (!catalog.some((m) => m.id === materialId)) return;
    if (assignedMaterialIds.has(materialId)) return;
    setBusyMaterialId(materialId);
    try {
      await assignTheory({
        materialId,
        studentIds: [selectedStudentId],
      });
    } finally {
      setBusyMaterialId(null);
    }
  }

  const studentLocked = Boolean(lockedStudentId);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Сначала выберите ученика — затем каталог покажет теорию его класса и
        направления из общей и собственной библиотеки.
      </p>

      {!studentLocked ? (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label>Шаг 1. Ученик</Label>
            <Input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Найти ученика по имени"
            />
          </div>
          {filteredStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ученики не найдены.</p>
          ) : (
            <ul className="max-h-56 divide-y overflow-y-auto rounded-xl border border-border">
              {filteredStudents.map((s) => {
                const on = selectedStudentId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setTheoryQuery("");
                      }}
                      className={
                        on
                          ? "flex w-full items-center justify-between bg-muted px-3 py-2 text-left text-sm"
                          : "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                      }
                    >
                      <span className="font-medium">{s.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {gradeLabel(s.grade)}
                        {on ? " · выбран" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : selectedStudent ? (
        <p className="text-sm">
          Ученик:{" "}
          <span className="font-medium">{selectedStudent.fullName}</span>
          <span className="text-muted-foreground">
            {" "}
            · {gradeLabel(selectedStudent.grade)}
          </span>
        </p>
      ) : null}

      {selectedStudent ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label>Шаг 2. Теория для ученика</Label>
              <Input
                value={theoryQuery}
                onChange={(e) => setTheoryQuery(e.target.value)}
                placeholder="Поиск по названию"
              />
            </div>
            {!lockedDirectionId && directionOptions.length > 1 ? (
              <div className="w-full space-y-1.5 sm:w-56">
                <Label>Направление</Label>
                <Select
                  value={directionId || "__none__"}
                  onValueChange={(v) => {
                    if (!v || v === "__none__") return;
                    setDirectionId(v);
                    setTheoryQuery("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        directionOptions.find((d) => d.id === v)?.name ??
                        "Направление"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {directionOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {filteredCatalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {catalog.length === 0
                ? emptyHint
                : "По запросу ничего не найдено"}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border border-border">
              {filteredCatalog.map((material) => {
                const already = assignedMaterialIds.has(material.id);
                const busy = busyMaterialId === material.id;
                return (
                  <li
                    key={material.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {material.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {material.libraryScope === "school"
                          ? "Общая"
                          : "Собственная"}
                      </p>
                    </div>
                    {already ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Уже отправлена
                        </span>
                        <Link
                          href={`/kafedra/theory/${material.id}/results`}
                          className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                        >
                          Открыть
                        </Link>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || Boolean(busyMaterialId)}
                        onClick={() => void assignOne(material.id)}
                      >
                        {busy ? "Отправка…" : "Назначить"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Выберите ученика, чтобы увидеть подходящую теорию.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-medium">Текущие назначения</h3>
          <Input
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value)}
            placeholder="Фильтр по ученику"
            className="max-w-xs"
          />
        </div>
        {assignmentRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет назначений.</p>
        ) : (
          <ul className="divide-y rounded-xl border border-border text-sm">
            {assignmentRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="font-medium">{row.studentName}</span>
                <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>
                    {row.materialTitle}
                    {row.libraryScope === "school"
                      ? " · Общая"
                      : " · Собственная"}
                  </span>
                  <Link
                    href={`/kafedra/theory/${row.materialId}/results`}
                    className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Открыть
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
