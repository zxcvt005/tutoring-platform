"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import {
  HomeworkAssignmentStatusBadge,
  LessonStatusBadge,
  TopicStatusBadge,
} from "@/components/status-badge";
import { AssignmentReviewDialog } from "@/components/tests/assignment-review-dialog";
import { TestEditorDialog } from "@/components/tests/test-editor-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatDueAt } from "@/lib/format";
import { computeMaxScore, questionTypeLabel } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Homework, HomeworkAssignment } from "@/lib/types";

const statusLabel: Record<Homework["status"], string> = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "В архиве",
};

export function TopicDetail({ topicId }: { topicId: string }) {
  const {
    data,
    ready,
    homeworksForTopic,
    studentsForTeacher,
    deleteHomework,
    publishHomework,
    assignHomework,
  } = useDemoStore();

  const topic = data.topics.find((t) => t.id === topicId);
  const homeworks = homeworksForTopic(topicId);
  const lessons = useMemo(
    () => data.lessons.filter((l) => l.topicId === topicId),
    [data.lessons, topicId]
  );
  const assignments = data.homeworkAssignments.filter(
    (a) => a.topicId === topicId
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingHw, setEditingHw] = useState<Homework | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<HomeworkAssignment | null>(null);
  const [assignForm, setAssignForm] = useState({
    homeworkId: "",
    studentId: "",
    dueAt: "",
  });

  if (ready && !topic) notFound();
  if (!topic) return <p className="text-sm text-muted-foreground">Загрузка…</p>;

  if (topic.teacherId !== data.currentTeacherId) {
    return (
      <p className="text-sm text-muted-foreground">
        Тема принадлежит другому преподавателю.{" "}
        <Link href="/kafedra/topics" className="underline">
          К списку
        </Link>
      </p>
    );
  }

  const students = studentsForTeacher(data.currentTeacherId);
  const visibleTests = homeworks.filter((h) => h.status !== "archived");

  function openEditor(h?: Homework) {
    setEditingHw(h ?? null);
    setEditorOpen(true);
  }

  function saveAssign() {
    if (!assignForm.homeworkId || !assignForm.studentId) {
      toast.error("Выберите тест и ученика");
      return;
    }
    void (async () => {
      const result = await assignHomework({
        homeworkId: assignForm.homeworkId,
        topicId,
        teacherId: topic!.teacherId,
        studentIds: [assignForm.studentId],
        dueAt: assignForm.dueAt
          ? new Date(assignForm.dueAt).toISOString()
          : undefined,
      });
      if (!result.ok) return;
      if (result.created === 0) {
        toast.message("Такое назначение уже есть");
      }
      setAssignOpen(false);
    })();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={topic.title}
        description={`${topic.subject}${topic.programNote ? ` · ${topic.programNote}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <TopicStatusBadge status={topic.status} />
            <Link
              href="/kafedra/topics"
              className="text-sm font-medium underline-offset-2 hover:underline"
            >
              ← К темам
            </Link>
          </div>
        }
      />

      {topic.description ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {topic.description}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Тесты
          </h2>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                const published = visibleTests.filter(
                  (h) => h.status === "published"
                );
                setAssignForm({
                  homeworkId: published[0]?.id ?? "",
                  studentId: students[0]?.id ?? "",
                  dueAt: "",
                });
                setAssignOpen(true);
              }}
            >
              Назначить ученику
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={() => openEditor()}
            >
              Создать тест
            </Button>
          </div>
        </div>
        {visibleTests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет тестов к теме. Создайте тест с заданиями разных типов.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Заданий</TableHead>
                <TableHead>Макс. балл</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTests.map((h) => {
                const qCount = h.questions?.length ?? 0;
                const max = computeMaxScore(h.questions ?? []) || h.maxScore;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">
                      <div>
                        {h.title}
                        {h.description ? (
                          <p className="mt-0.5 text-xs font-normal text-muted-foreground line-clamp-1">
                            {h.description}
                          </p>
                        ) : null}
                        {qCount > 0 ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {[
                              ...new Set(
                                (h.questions ?? []).map(
                                  (q) => questionTypeLabel[q.type]
                                )
                              ),
                            ].join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{statusLabel[h.status]}</TableCell>
                    <TableCell className="tabular-nums">{qCount}</TableCell>
                    <TableCell className="tabular-nums">{max ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditor(h)}
                        >
                          Изменить
                        </Button>
                        {h.status === "draft" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => publishHomework(h.id)}
                          >
                            Опубликовать
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteHomework(h.id)}
                        >
                          В архив
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Назначения и результаты
        </h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ещё не назначали.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Тест</TableHead>
                <TableHead>Ученик</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Балл</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => {
                const title =
                  a.testSnapshot?.title ||
                  data.homeworks.find((h) => h.id === a.homeworkId)?.title;
                const pct =
                  a.score != null && a.maxScore
                    ? Math.round((a.score / a.maxScore) * 100)
                    : null;
                return (
                  <TableRow key={a.id}>
                    <TableCell>{title}</TableCell>
                    <TableCell>
                      {data.students.find((s) => s.id === a.studentId)
                        ?.fullName}
                    </TableCell>
                    <TableCell>{formatDueAt(a.dueAt)}</TableCell>
                    <TableCell>
                      <HomeworkAssignmentStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.score != null
                        ? `${a.score}/${a.maxScore ?? "—"}${
                            pct != null ? ` (${pct}%)` : ""
                          }`
                        : a.status === "completed"
                          ? "ждёт проверки"
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setReviewOpen(a)}
                      >
                        Открыть
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          История занятий по теме
        </h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Тема ещё не отмечалась на занятиях.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда</TableHead>
                <TableHead>Ученик</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{formatDateTime(l.startsAt)}</TableCell>
                  <TableCell>
                    {l.studentIds
                      .map(
                        (sid) =>
                          data.students.find((s) => s.id === sid)?.fullName ??
                          "Ученик"
                      )
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    <LessonStatusBadge status={l.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <TestEditorDialog
        topicId={topicId}
        teacherId={topic.teacherId}
        homework={editingHw}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />

      <AssignmentReviewDialog
        assignment={reviewOpen}
        open={!!reviewOpen}
        onOpenChange={(o) => !o && setReviewOpen(null)}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Назначить тест ученику</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Опубликованный тест</Label>
              <Select
                value={assignForm.homeworkId || null}
                onValueChange={(v) =>
                  v && setAssignForm({ ...assignForm, homeworkId: v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      visibleTests.find((h) => h.id === v)?.title ?? "Тест"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {visibleTests
                    .filter((h) => h.status === "published")
                    .map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {visibleTests.filter((h) => h.status === "published").length ===
              0 ? (
                <p className="text-xs text-muted-foreground">
                  Нет опубликованных тестов.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setAssignOpen(false);
                      openEditor();
                    }}
                  >
                    Создать тест
                  </button>
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Ученик</Label>
              <Select
                value={assignForm.studentId || null}
                onValueChange={(v) =>
                  v && setAssignForm({ ...assignForm, studentId: v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      students.find((s) => s.id === v)?.fullName ?? "Ученик"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Срок (необязательно)</Label>
              <Input
                type="datetime-local"
                value={assignForm.dueAt}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, dueAt: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Если не указать — задание будет без дедлайна.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignOpen(false)}
            >
              Отмена
            </Button>
            <Button type="button" onClick={saveAssign}>
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
