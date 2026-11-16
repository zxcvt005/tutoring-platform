"use client";

import { useMemo, useState } from "react";

import { TheoryAssignDialog } from "@/components/theory/theory-assign-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDemoStore } from "@/lib/store/demo-store";
import type { TheoryMaterial } from "@/lib/types";

export function TheoryAssignmentWorkspace() {
  const {
    data,
    studentsForTeacher,
    publishedTheoriesForTeacher,
    theoryAssignmentsForTeacher,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const materials = publishedTheoriesForTeacher(teacherId);
  const assignments = theoryAssignmentsForTeacher(teacherId);
  const students = studentsForTeacher(teacherId).filter((s) => s.status === "active");

  const [query, setQuery] = useState("");
  const [pickMaterial, setPickMaterial] = useState<TheoryMaterial | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");

  const filteredMaterials = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.title.toLowerCase().includes(q));
  }, [materials, query]);

  const assignmentRows = useMemo(() => {
    const q = studentFilter.trim().toLowerCase();
    return assignments
      .map((a) => {
        const material = materials.find((m) => m.id === a.materialId);
        const student = students.find((s) => s.id === a.studentId);
        return {
          ...a,
          materialTitle: material?.title ?? "Теория",
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
  }, [assignments, materials, students, studentFilter]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Назначайте опубликованную теорию из общей базы или собственных материалов.
        Назначение создаётся от вашего имени.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Поиск теории</Label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название материала"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Фильтр по ученику в списке назначений</Label>
          <Input
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            placeholder="Фамилия или имя"
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Выберите теорию</h3>
        {filteredMaterials.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет опубликованных материалов.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border border-border">
            {filteredMaterials.map((material) => (
              <li
                key={material.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{material.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {material.libraryScope === "school" ? "Общая" : "Собственная"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPickMaterial(material);
                    setDialogOpen(true);
                  }}
                >
                  Назначить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Текущие назначения</h3>
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
                <span className="text-muted-foreground">
                  {row.materialTitle}
                  {row.libraryScope === "school" ? " · Общая" : " · Собственная"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TheoryAssignDialog
        material={pickMaterial}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setPickMaterial(null);
        }}
      />
    </div>
  );
}