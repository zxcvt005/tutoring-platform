"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { attendanceStatusLabel } from "@/lib/format";
import { lessonParticipantsLabel, uniqueStudentIds } from "@/lib/schedule";
import { useDemoStore } from "@/lib/store/demo-store";
import type { AttendanceStatus, Lesson } from "@/lib/types";

const ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  "present",
  "absent",
  "cancelled",
  "rescheduled",
];

export function CompleteLessonDialog({
  lesson,
  open,
  onOpenChange,
}: {
  lesson: Lesson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Завершить занятие</DialogTitle>
        </DialogHeader>
        {open && lesson ? (
          <CompleteForm
            key={lesson.id}
            lesson={lesson}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CompleteForm({
  lesson,
  onClose,
}: {
  lesson: Lesson;
  onClose: () => void;
}) {
  const {
    data,
    topicsForTeacher,
    completeLesson,
    upsertTopic,
    sectionsForTeacher,
    publishedHomeworksForTopic,
  } = useDemoStore();
  const topics = topicsForTeacher(lesson.teacherId).filter(
    (t) => t.status === "active"
  );
  const participantIds = uniqueStudentIds(lesson.studentIds);
  const [attendanceByStudent, setAttendanceByStudent] = useState<
    Record<string, AttendanceStatus>
  >(() =>
    Object.fromEntries(participantIds.map((id) => [id, "present" as const]))
  );
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [assignHw, setAssignHw] = useState(false);
  const [homeworkId, setHomeworkId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignMode, setAssignMode] = useState<"present" | "selected">(
    "present"
  );
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const nameOf = (id: string) =>
    data.students.find((s) => s.id === id)?.fullName ?? "Ученик";
  const sections = sectionsForTeacher(lesson.teacherId);

  const publishedTests = useMemo(
    () => (topicId ? publishedHomeworksForTopic(topicId) : []),
    [publishedHomeworksForTopic, topicId]
  );

  const presentIds = participantIds.filter(
    (id) => attendanceByStudent[id] === "present"
  );

  // При смене темы сбрасываем выбранный тест
  function onTopicChange(id: string) {
    setTopicId(id);
    setHomeworkId("");
  }

  function toggleStudent(id: string) {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function save() {
    let tid = topicId;
    if (creatingTopic) {
      if (!newTitle.trim()) return;
      tid = upsertTopic({
        teacherId: lesson.teacherId,
        sectionId: null,
        title: newTitle.trim(),
        subject: lesson.subject || "Предмет",
        description: newDesc.trim() || undefined,
        status: "active",
      });
    }
    if (!tid) return;

    let homeworkAssign:
      | {
          homeworkId: string;
          studentIds: string[];
          dueAt?: string;
        }
      | undefined;

    if (assignHw) {
      if (!homeworkId) return;
      const studentIds =
        assignMode === "present"
          ? presentIds
          : selectedStudents.filter((id) => participantIds.includes(id));
      if (studentIds.length === 0) return;
      homeworkAssign = {
        homeworkId,
        studentIds,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      };
    }

    const result = completeLesson({
      lessonId: lesson.id,
      topicId: tid,
      attendances: participantIds.map((studentId) => ({
        studentId,
        status: attendanceByStudent[studentId] ?? "present",
      })),
      homeworkAssign,
    });
    if (result.ok) onClose();
  }

  const canSave =
    participantIds.length > 0 &&
    (!assignHw ||
      (!!homeworkId &&
        (assignMode === "present"
          ? presentIds.length > 0
          : selectedStudents.length > 0)));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {lessonParticipantsLabel(lesson, nameOf)} · тема одна на занятие,
        посещаемость — по каждому ученику.
      </p>
      <div className="grid gap-3">
        <div className="space-y-2">
          <Label>Посещаемость</Label>
          <ul className="space-y-2 rounded-xl border border-border/80 p-2">
            {participantIds.map((sid) => (
              <li
                key={sid}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium">{nameOf(sid)}</span>
                <Select
                  value={attendanceByStudent[sid] ?? "present"}
                  onValueChange={(v) =>
                    v &&
                    setAttendanceByStudent((prev) => ({
                      ...prev,
                      [sid]: v as AttendanceStatus,
                    }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue>
                      {(v) =>
                        attendanceStatusLabel[v as AttendanceStatus] ?? "Статус"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {attendanceStatusLabel[opt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>

        {!creatingTopic ? (
          <div className="space-y-1.5">
            <Label>Пройденная тема</Label>
            <Select
              value={topicId || null}
              onValueChange={(v) => v && onTopicChange(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите тему">
                  {(v) => topics.find((t) => t.id === v)?.title ?? "Тема"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {topics.map((t) => {
                  const sec = sections.find((s) => s.id === t.sectionId);
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      {sec ? `${sec.title}: ${t.title}` : t.title}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <button
              type="button"
              className="text-sm font-medium underline-offset-2 hover:underline"
              onClick={() => setCreatingTopic(true)}
            >
              Создать новую тему
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-border/80 p-3">
            <Label>Новая тема</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Название"
            />
            <Textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Описание (необязательно)"
            />
            <p className="text-xs text-muted-foreground">
              Тема появится в блоке «Без раздела» — потом можно перенести.
            </p>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setCreatingTopic(false)}
            >
              Выбрать из существующих
            </button>
          </div>
        )}

        {!creatingTopic && topicId ? (
          <div className="space-y-3 rounded-xl border border-border/80 p-3">
            <label className="flex items-start gap-2.5">
              <Checkbox
                checked={assignHw}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setAssignHw(on);
                  if (on && publishedTests[0] && !homeworkId) {
                    setHomeworkId(publishedTests[0].id);
                  }
                }}
                className="mt-0.5"
              />
              <span className="text-sm leading-snug">
                <span className="font-medium">Назначить тест как ДЗ</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Явное действие: без галочки задание не создаётся.
                </span>
              </span>
            </label>

            {assignHw ? (
              <div className="grid gap-3 pl-0 sm:pl-1">
                {publishedTests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Для этой темы нет опубликованного теста.{" "}
                    <Link
                      href={`/kafedra/topics/${topicId}`}
                      className="font-medium underline-offset-2 hover:underline"
                      onClick={onClose}
                    >
                      Создать тест в теме
                    </Link>
                  </p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Тест</Label>
                      <Select
                        value={homeworkId || null}
                        onValueChange={(v) => v && setHomeworkId(v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v) =>
                              publishedTests.find((h) => h.id === v)?.title ??
                              "Тест"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {publishedTests.map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.title}
                              {h.maxScore != null ? ` · ${h.maxScore} б.` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Кому назначить</Label>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={assignMode === "present"}
                            onChange={() => setAssignMode("present")}
                          />
                          Всем присутствовавшим ({presentIds.length})
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={assignMode === "selected"}
                            onChange={() => {
                              setAssignMode("selected");
                              setSelectedStudents(presentIds);
                            }}
                          />
                          Выбранным
                        </label>
                      </div>
                      {assignMode === "selected" ? (
                        <ul className="space-y-1.5 rounded-lg border border-border/70 p-2">
                          {participantIds.map((sid) => {
                            const present =
                              attendanceByStudent[sid] === "present";
                            return (
                              <li key={sid}>
                                <label className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={selectedStudents.includes(sid)}
                                    onCheckedChange={() => toggleStudent(sid)}
                                  />
                                  <span>
                                    {nameOf(sid)}
                                    {!present ? (
                                      <span className="text-xs text-muted-foreground">
                                        {" "}
                                        (не отмечен как присутствующий)
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {assignMode === "present" && presentIds.length === 0 ? (
                        <p className="text-xs text-destructive">
                          Нет присутствующих — выберите учеников вручную или
                          отметьте посещаемость.
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Срок (необязательно)</Label>
                      <Input
                        type="datetime-local"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" onClick={save} disabled={!canSave}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}
