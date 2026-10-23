"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDemoStore } from "@/lib/store/demo-store";
import type { TheoryMaterial } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TheoryAssignDialog({
  material,
  open,
  onOpenChange,
}: {
  material: TheoryMaterial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, studentsForTeacher, theoryAssignmentsForTeacher, assignTheory } =
    useDemoStore();
  const students = studentsForTeacher(data.currentTeacherId).filter(
    (s) => s.status === "active"
  );
  const assigned = theoryAssignmentsForTeacher(data.currentTeacherId).filter(
    (a) => a.materialId === material?.id
  );
  const assignedIds = new Set(assigned.map((a) => a.studentId));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) =>
      q ? s.fullName.toLowerCase().includes(q) : true
    );
  }, [students, query]);

  function toggle(id: string) {
    if (assignedIds.has(id)) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit() {
    if (!material || selected.length === 0) return;
    setBusy(true);
    const result = await assignTheory({
      materialId: material.id,
      studentIds: selected,
    });
    setBusy(false);
    if (result.ok) {
      setSelected([]);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        if (!next) setSelected([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отправить ученикам</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {material?.title ?? "Теория"}
        </p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти ученика по имени"
        />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-1 py-3 text-sm text-muted-foreground">
              Ученики не найдены
            </li>
          ) : (
            filtered.map((s) => {
              const already = assignedIds.has(s.id);
              const on = selected.includes(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm",
                      already
                        ? "text-muted-foreground"
                        : on
                          ? "bg-muted"
                          : "hover:bg-muted/50"
                    )}
                  >
                    <span>{s.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {already ? "Уже отправлена" : on ? "Выбран" : ""}
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
            disabled={busy || selected.length === 0}
            onClick={() => void submit()}
          >
            {busy ? "Отправка…" : `Отправить (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
