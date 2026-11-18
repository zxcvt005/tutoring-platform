"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

/**
 * Назначение теории одному уже известному ученику (карточка занятия).
 * Каталог фильтруется по классу и направлению — как темы/ДЗ.
 */
export function TheoryAssignDialog({
  studentId,
  lessonSubject,
  directionId: lockedDirectionId,
  open,
  onOpenChange,
}: {
  studentId: string;
  lessonSubject?: string | null;
  directionId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    data,
    publishedTheoriesForTeacher,
    theoryAssignmentsForTeacher,
    assignTheory,
  } = useDemoStore();
  const student = data.students.find((s) => s.id === studentId) ?? null;
  const materials = publishedTheoriesForTeacher(data.currentTeacherId);
  const assignments = theoryAssignmentsForTeacher(data.currentTeacherId);
  const assignedIds = useMemo(
    () =>
      new Set(
        assignments
          .filter((a) => a.studentId === studentId)
          .map((a) => a.materialId)
      ),
    [assignments, studentId]
  );

  const directionOptions = useMemo(
    () =>
      student
        ? theoryDirectionOptionsForStudent(
            student,
            data.studentDirectionBalances ?? [],
            data.learningDirections ?? []
          )
        : [],
    [student, data.studentDirectionBalances, data.learningDirections]
  );

  const [directionId, setDirectionId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedMaterialId(null);
    if (lockedDirectionId) {
      setDirectionId(lockedDirectionId);
      return;
    }
    setDirectionId(directionOptions[0]?.id ?? "");
  }, [open, lockedDirectionId, directionOptions]);

  const subjectCtx = useMemo(
    () => ({
      lessonSubject: lessonSubject ?? null,
      directionId: directionId || lockedDirectionId || null,
      directions: data.learningDirections,
    }),
    [
      lessonSubject,
      directionId,
      lockedDirectionId,
      data.learningDirections,
    ]
  );

  const catalog = useMemo(
    () =>
      filterTheoryCatalogForStudent(materials, data.materialFolders, {
        ...subjectCtx,
        studentGrade: student?.grade,
      }),
    [materials, data.materialFolders, subjectCtx, student?.grade]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((m) => m.title.toLowerCase().includes(q));
  }, [catalog, query]);

  const emptyHint = theoryCatalogEmptyHint({
    ...subjectCtx,
    student,
  });

  async function submit() {
    if (!selectedMaterialId || !studentId) return;
    if (!catalog.some((m) => m.id === selectedMaterialId)) return;
    if (assignedIds.has(selectedMaterialId)) return;
    setBusy(true);
    const result = await assignTheory({
      materialId: selectedMaterialId,
      studentIds: [studentId],
    });
    setBusy(false);
    if (result.ok) {
      setSelectedMaterialId(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        if (!next) setSelectedMaterialId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Назначить теорию</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {student
            ? `${student.fullName} · ${gradeLabel(student.grade)}`
            : "Ученик"}
        </p>

        {!lockedDirectionId && directionOptions.length > 1 ? (
          <Select
            value={directionId || "__none__"}
            onValueChange={(v) => {
              if (!v || v === "__none__") return;
              setDirectionId(v);
              setSelectedMaterialId(null);
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
        ) : null}

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти теорию по названию"
        />

        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-1 py-3 text-sm text-muted-foreground">
              {catalog.length === 0
                ? emptyHint
                : "По запросу ничего не найдено"}
            </li>
          ) : (
            filtered.map((m) => {
              const already = assignedIds.has(m.id);
              const on = selectedMaterialId === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() =>
                      setSelectedMaterialId((prev) =>
                        prev === m.id ? null : m.id
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm",
                      already
                        ? "text-muted-foreground"
                        : on
                          ? "bg-muted"
                          : "hover:bg-muted/50"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {m.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.libraryScope === "school"
                          ? "Общая"
                          : "Собственная"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {already ? "Уже отправлена" : on ? "Выбрана" : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={busy || !selectedMaterialId}
            onClick={() => void submit()}
          >
            {busy ? "Отправка…" : "Отправить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
