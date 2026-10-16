"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import {
  HomeworkAssignmentStatusBadge,
  LessonStatusBadge,
  TopicStatusBadge,
} from "@/components/status-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type { CheckType, Homework } from "@/lib/types";

export function TopicDetail({ topicId }: { topicId: string }) {
  const {
    data,
    ready,
    homeworksForTopic,
    studentsForTeacher,
    upsertHomework,
    deleteHomework,
    upsertHomeworkAssignment,
  } = useDemoStore();

  const topic = data.topics.find((t) => t.id === topicId);
  const homeworks = homeworksForTopic(topicId);
  const lessons = useMemo(
    () => data.lessons.filter((l) => l.topicId === topicId),
    [data.lessons, topicId]
  );
  const assignments = data.homeworkAssignments.filter((a) => a.topicId === topicId);

  const [hwOpen, setHwOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [hwForm, setHwForm] = useState({
    id: undefined as string | undefined,
    title: "",
    description: "",
    checkType: "score" as CheckType,
    maxScore: "10",
  });
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

  function openHw(h?: Homework) {
    setHwForm(
      h
        ? {
            id: h.id,
            title: h.title,
            description: h.description ?? "",
            checkType: h.checkType,
            maxScore: h.maxScore != null ? String(h.maxScore) : "",
          }
        : {
            id: undefined,
            title: "",
            description: "",
            checkType: "score",
            maxScore: "10",
          }
    );
    setHwOpen(true);
  }

  function saveHw() {
    if (!hwForm.title.trim()) return;
    upsertHomework({
      id: hwForm.id,
      topicId,
      teacherId: topic!.teacherId,
      title: hwForm.title.trim(),
      description: hwForm.description.trim() || undefined,
      checkType: hwForm.checkType,
      maxScore: hwForm.maxScore ? Number(hwForm.maxScore) : undefined,
      status: "active",
    });
    setHwOpen(false);
  }

  function saveAssign() {
    if (!assignForm.homeworkId || !assignForm.studentId || !assignForm.dueAt)
      return;
    const hw = data.homeworks.find((h) => h.id === assignForm.homeworkId);
    upsertHomeworkAssignment({
      homeworkId: assignForm.homeworkId,
      topicId,
      teacherId: topic!.teacherId,
      studentId: assignForm.studentId,
      dueAt: new Date(assignForm.dueAt).toISOString(),
      status: "assigned",
      maxScore: hw?.maxScore,
    });
    setAssignOpen(false);
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
            Домашние задания
          </h2>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setAssignForm({
                  homeworkId: homeworks[0]?.id ?? "",
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
              onClick={() => openHw()}
            >
              Добавить ДЗ
            </Button>
          </div>
        </div>
        {homeworks.filter((h) => h.status === "active").length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет заданий к теме.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Проверка</TableHead>
                <TableHead>Макс. балл</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {homeworks
                .filter((h) => h.status === "active")
                .map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.title}</TableCell>
                    <TableCell>{h.checkType}</TableCell>
                    <TableCell>{h.maxScore ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openHw(h)}
                        >
                          Изменить
                        </Button>
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
                ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Назначения ученикам
        </h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ещё не назначали.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Задание</TableHead>
                <TableHead>Ученик</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Балл</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {data.homeworks.find((h) => h.id === a.homeworkId)?.title}
                  </TableCell>
                  <TableCell>
                    {data.students.find((s) => s.id === a.studentId)?.fullName}
                  </TableCell>
                  <TableCell>{formatDateTime(a.dueAt)}</TableCell>
                  <TableCell>
                    <HomeworkAssignmentStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>
                    {a.score != null ? `${a.score}/${a.maxScore ?? "—"}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
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

      <Dialog open={hwOpen} onOpenChange={setHwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hwForm.id ? "Редактировать ДЗ" : "Новое ДЗ"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input
                value={hwForm.title}
                onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Условие</Label>
              <Textarea
                value={hwForm.description}
                onChange={(e) =>
                  setHwForm({ ...hwForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Тип проверки</Label>
              <Select
                value={hwForm.checkType}
                onValueChange={(v) =>
                  v && setHwForm({ ...hwForm, checkType: v as CheckType })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Балл</SelectItem>
                  <SelectItem value="pass_fail">Зачёт</SelectItem>
                  <SelectItem value="comment">Комментарий</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Макс. балл</Label>
              <Input
                value={hwForm.maxScore}
                onChange={(e) =>
                  setHwForm({ ...hwForm, maxScore: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHwOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={saveHw}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Назначить ДЗ ученику</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Задание</Label>
              <Select
                value={assignForm.homeworkId || null}
                onValueChange={(v) =>
                  v && setAssignForm({ ...assignForm, homeworkId: v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      homeworks.find((h) => h.id === v)?.title ?? "Задание"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {homeworks
                    .filter((h) => h.status === "active")
                    .map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
              <Label>Срок</Label>
              <Input
                type="datetime-local"
                value={assignForm.dueAt}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, dueAt: e.target.value })
                }
              />
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
