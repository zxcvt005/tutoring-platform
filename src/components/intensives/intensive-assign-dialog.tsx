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
import { intensiveDeadlinesReady } from "@/lib/intensives/progress";
import { fromAppDateTimeLocalValue } from "@/lib/app-time";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Intensive } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IntensiveAssignDialog({
  intensive,
  open,
  onOpenChange,
}: {
  intensive: Intensive | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, studentsForTeacher, intensiveAssignmentsForTeacher, assignIntensive } =
    useDemoStore();
  const students = studentsForTeacher(data.currentTeacherId).filter(
    (student) => student.status === "active"
  );
  const assignedIds = new Set(
    intensiveAssignmentsForTeacher(data.currentTeacherId)
      .filter((item) => item.intensiveId === intensive?.id)
      .map((item) => item.studentId)
  );
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) =>
      q ? student.fullName.toLowerCase().includes(q) : true
    );
  }, [students, query]);
  const tests = intensive?.tests ?? [];
  const ready = intensiveDeadlinesReady(
    tests.map((test) => test.testId),
    deadlines
  );
  const student = students.find((item) => item.id === studentId);

  function close(next: boolean) {
    if (busy && !next) return;
    if (!next) {
      setStudentId(null);
      setDeadlines({});
      setQuery("");
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!intensive || !studentId || !ready) return;
    setBusy(true);
    const result = await assignIntensive({
      intensiveId: intensive.id,
      studentId,
      deadlines: tests.map((test) => ({
        testId: test.testId,
        dueAt: fromAppDateTimeLocalValue(deadlines[test.testId] ?? ""),
      })),
    });
    setBusy(false);
    if (result.ok) close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {student ? "Дедлайны тестов" : "Отправить ученику"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{intensive?.title}</p>
        {student ? (
          <div className="space-y-3">
            <p className="text-sm">{student.fullName}</p>
            {tests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                В этой версии нет тестов. Ученик получит видео и конспект.
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {tests.map((test) => (
                  <li key={test.testId} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                    <span className="truncate text-sm">{test.title}</span>
                    <Input
                      type="datetime-local"
                      aria-label={`Дедлайн: ${test.title}`}
                      value={deadlines[test.testId] ?? ""}
                      onChange={(event) =>
                        setDeadlines((current) => ({
                          ...current,
                          [test.testId]: event.target.value,
                        }))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти ученика по имени"
            />
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-1 py-3 text-sm text-muted-foreground">
                  Ученики не найдены
                </li>
              ) : (
                filtered.map((item) => {
                  const already = assignedIds.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => setStudentId(item.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm",
                          already ? "text-muted-foreground" : "hover:bg-muted/50"
                        )}
                      >
                        <span>{item.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {already ? "Уже отправлен" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}
        <DialogFooter>
          {student ? (
            <Button type="button" variant="outline" onClick={() => setStudentId(null)}>
              К ученикам
            </Button>
          ) : null}
          <Button type="button" disabled={!student || !ready || busy} onClick={() => void submit()}>
            Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
