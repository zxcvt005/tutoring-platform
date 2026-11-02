"use client";

import { useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EgeChecker } from "@/components/mock-exams/ege-checker";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { appDateKey } from "@/lib/app-time";
import {
  compareMockExams,
  formatExamDate,
  parseExamDate,
  parseExamDescription,
  parseExamTitle,
  parseTestScore,
  TEST_SCORE_MAX,
} from "@/lib/mock-exams/records";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

type ExamForm = {
  id?: string;
  title: string;
  date: string;
  description: string;
};

export function MockExamsWorkspace() {
  const {
    data,
    studentsForTeacher,
    createMockExam,
    updateMockExam,
    deleteMockExam,
    setMockExamResult,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const students = useMemo(
    () =>
      studentsForTeacher(teacherId)
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
    [studentsForTeacher, teacherId]
  );
  const exams = useMemo(
    () =>
      data.mockExams
        .filter((exam) => exam.teacherId === teacherId)
        .slice()
        .sort(compareMockExams),
    [data.mockExams, teacherId]
  );
  const scores = useMemo(() => {
    const map = new Map<string, number>();
    const studentIds = new Set(students.map((student) => student.id));
    for (const result of data.mockExamResults) {
      if (!studentIds.has(result.studentId)) continue;
      map.set(`${result.mockExamId}:${result.studentId}`, result.testScore);
    }
    return map;
  }, [data.mockExamResults, students]);

  const [form, setForm] = useState<ExamForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingExam, setSavingExam] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const examToDelete = exams.find((exam) => exam.id === deleteId) ?? null;

  async function submitExam() {
    if (!form) return;
    const title = parseExamTitle(form.title);
    if (!title.ok) {
      setFormError(title.message);
      return;
    }
    const date = parseExamDate(form.date);
    if (!date.ok) {
      setFormError(date.message);
      return;
    }
    const description = parseExamDescription(form.description);
    if (!description.ok) {
      setFormError(description.message);
      return;
    }
    setSavingExam(true);
    const payload = {
      title: title.value,
      date: date.value,
      description: description.value,
    };
    const result = form.id
      ? await updateMockExam({ id: form.id, ...payload })
      : await createMockExam(payload);
    setSavingExam(false);
    if (result.ok) setForm(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Пробники"
        description="Первичные баллы учеников. Проверка ЕГЭ не записывает результат в таблицу."
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              onClick={() => {
                setFormError(null);
                setForm({
                  title: "",
                  date: appDateKey(new Date()),
                  description: "",
                });
              }}
            >
              Создать пробник
            </Button>
            <p className="text-xs text-muted-foreground">
              Пустая ячейка — результат ещё не внесён. Вторичный балл от 0 до {TEST_SCORE_MAX}.
            </p>
          </div>

          {students.length === 0 ? (
            <div className="panel px-4 py-8 text-sm text-muted-foreground">
              За вами пока нет закреплённых учеников.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 min-w-36 bg-card normal-case tracking-normal">
                    Ученик
                  </TableHead>
                  {exams.map((exam) => (
                    <TableHead
                      key={exam.id}
                      className="min-w-32 align-bottom normal-case tracking-normal"
                      title={exam.description}
                    >
                      <div className="font-medium text-foreground">{exam.title}</div>
                      <div className="mt-0.5 text-xs font-normal">
                        {formatExamDate(exam.date)}
                      </div>
                      <div className="mt-1 flex gap-2 text-xs font-normal">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => {
                            setFormError(null);
                            setForm({
                              id: exam.id,
                              title: exam.title,
                              date: exam.date,
                              description: exam.description ?? "",
                            });
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="text-destructive"
                          onClick={() => setDeleteId(exam.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} className="group">
                    <TableCell className="sticky left-0 z-10 bg-card font-medium group-hover:bg-muted">
                      {student.fullName}
                    </TableCell>
                    {exams.map((exam) => (
                      <TableCell key={exam.id}>
                        <ScoreCell
                          score={scores.get(`${exam.id}:${student.id}`) ?? null}
                          onCommit={(testScore) =>
                            setMockExamResult({
                              mockExamId: exam.id,
                              studentId: student.id,
                              testScore,
                            })
                          }
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {students.length > 0 && exams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Создайте первый пробник — он появится столбцом таблицы.
            </p>
          ) : null}
        </section>
        <EgeChecker />
      </div>

      <Dialog
        open={form != null}
        onOpenChange={(open) => {
          if (!open && !savingExam) setForm(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Изменить пробник" : "Новый пробник"}
            </DialogTitle>
            <DialogDescription>
              Столбец появится у всех ваших учеников. Баллы вводятся отдельно.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mock-exam-title">Название</Label>
              <Input
                id="mock-exam-title"
                value={form?.title ?? ""}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, title: event.target.value } : current
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mock-exam-date">Дата проведения</Label>
              <Input
                id="mock-exam-date"
                type="date"
                value={form?.date ?? ""}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, date: event.target.value } : current
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mock-exam-description">Комментарий</Label>
              <Textarea
                id="mock-exam-description"
                value={form?.description ?? ""}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current
                  )
                }
              />
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingExam}
              onClick={() => setForm(null)}
            >
              Отмена
            </Button>
            <Button type="button" disabled={savingExam} onClick={submitExam}>
              {savingExam ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={examToDelete != null}
        title={
          examToDelete
            ? `Удалить пробник «${examToDelete.title}»?`
            : "Удалить пробник?"
        }
        description="Результаты учеников по этому пробнику тоже будут удалены."
        busy={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteId(null);
        }}
        onConfirm={() => {
          if (!deleteId) return;
          setDeleting(true);
          void deleteMockExam(deleteId).finally(() => {
            setDeleting(false);
            setDeleteId(null);
          });
        }}
      />
    </div>
  );
}

function ScoreCell({
  score,
  onCommit,
}: {
  score: number | null;
  onCommit: (testScore: number | null) => Promise<{ ok: boolean }>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const committing = useRef(false);
  const editing = draft != null;

  async function commit() {
    if (committing.current || draft == null) return;
    committing.current = true;
    try {
      const trimmed = draft.trim();
      if (trimmed === "") {
        if (score == null) {
          setDraft(null);
          setError(null);
          return;
        }
        setSaving(true);
        const result = await onCommit(null);
        setSaving(false);
        if (result.ok) {
          setDraft(null);
          setError(null);
        }
        return;
      }
      const parsed = parseTestScore(trimmed);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      if (parsed.value === score) {
        setDraft(null);
        setError(null);
        return;
      }
      setSaving(true);
      const result = await onCommit(parsed.value);
      setSaving(false);
      if (result.ok) {
        setDraft(null);
        setError(null);
      }
    } finally {
      committing.current = false;
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          "h-7 min-w-16 rounded-md px-1.5 text-sm tabular-nums",
          score == null
            ? "text-muted-foreground"
            : "text-foreground hover:bg-muted"
        )}
        onClick={() => {
          setError(null);
          setDraft(score == null ? "" : String(score));
        }}
      >
        {score == null ? "—" : `${score} / ${TEST_SCORE_MAX}`}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        autoFocus
        inputMode="numeric"
        aria-invalid={error ? true : undefined}
        aria-label="Вторичный балл"
        disabled={saving}
        value={draft}
        className="h-7 w-16 px-1.5 text-center"
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") {
            setDraft(null);
            setError(null);
          }
        }}
      />
      {error ? <p className="max-w-36 text-[10px] text-destructive">{error}</p> : null}
    </div>
  );
}
