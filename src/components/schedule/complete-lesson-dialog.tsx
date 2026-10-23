"use client";

import Link from "next/link";
import { useState } from "react";

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
import { fromAppDateTimeLocalValue } from "@/lib/app-time";
import { attendanceStatusLabel } from "@/lib/format";
import { lessonHasOccurred } from "@/lib/kafedra-today";
import { LESSON_MARK_CONTENT_ERROR } from "@/lib/lesson-mark-requirements";
import { topicsForLesson } from "@/lib/lesson-topics";
import { lessonParticipantsLabel, uniqueStudentIds } from "@/lib/schedule";
import { useDemoStore } from "@/lib/store/demo-store";
import type { AttendanceStatus, Lesson } from "@/lib/types";

const ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  "present",
  "absent_excused",
  "absent_unexcused",
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
          <DialogTitle>Тема и домашнее задание</DialogTitle>
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
    publishedHomeworksForTeacher,
  } = useDemoStore();
  const topics = topicsForTeacher(lesson.teacherId).filter(
    (t) => t.status === "active"
  );
  const participantIds = uniqueStudentIds(lesson.studentIds);
  const [attendanceByStudent, setAttendanceByStudent] = useState<
    Record<string, AttendanceStatus>
  >(() => {
    const initial: Record<string, AttendanceStatus> = {};
    for (const id of participantIds) {
      const att = data.attendances.find(
        (a) => a.lessonId === lesson.id && a.studentId === id
      );
      if (
        att &&
        (att.status === "present" ||
          att.status === "absent_excused" ||
          att.status === "absent_unexcused")
      ) {
        initial[id] = att.status;
      }
    }
    return initial;
  });
  const [pickedTopics, setPickedTopics] = useState<
    { topicId?: string | null; title: string }[]
  >(() =>
    topicsForLesson(lesson, topics).map((t) => ({
      topicId: t.topicId ?? null,
      title: t.title,
    }))
  );
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [topicPick, setTopicPick] = useState("");

  const [homeworkIds, setHomeworkIds] = useState<string[]>(() =>
    data.homeworkAssignments
      .filter(
        (a) =>
          a.sourceKind !== "theory" &&
          a.lessonId === lesson.id &&
          participantIds.includes(a.studentId)
      )
      .map((a) => a.homeworkId)
      .filter((id, i, arr) => arr.indexOf(id) === i)
  );
  const [homeworkPick, setHomeworkPick] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignMode, setAssignMode] = useState<"present" | "selected">(
    "present"
  );
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const nameOf = (id: string) =>
    data.students.find((s) => s.id === id)?.fullName ?? "Ученик";
  const sections = sectionsForTeacher(lesson.teacherId);
  const publishedTests = publishedHomeworksForTeacher(lesson.teacherId);

  const presentIds = participantIds.filter(
    (id) => attendanceByStudent[id] === "present"
  );

  function toggleStudent(id: string) {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function addPickedTopic(id: string) {
    const topic = topics.find((t) => t.id === id);
    if (!topic) return;
    setPickedTopics((prev) =>
      prev.some((t) => t.topicId === topic.id)
        ? prev
        : [...prev, { topicId: topic.id, title: topic.title }]
    );
    setTopicPick("");
  }

  function save() {
    const nextTopics = [...pickedTopics];
    if (creatingTopic) {
      if (!newTitle.trim()) return;
      const tid = upsertTopic({
        teacherId: lesson.teacherId,
        sectionId: null,
        title: newTitle.trim(),
        subject: lesson.subject || "Предмет",
        description: newDesc.trim() || newTitle.trim(),
        status: "active",
      });
      nextTopics.push({ topicId: tid, title: newTitle.trim() });
    }

    const studentIds =
      assignMode === "present"
        ? presentIds
        : selectedStudents.filter((id) => participantIds.includes(id));
    if (homeworkIds.length > 0 && studentIds.length === 0) return;

    const marking = participantIds.filter((id) => attendanceByStudent[id]);
    if (lessonHasOccurred(lesson) && marking.length > 0) {
      if (nextTopics.length === 0) {
        setFormError(LESSON_MARK_CONTENT_ERROR);
        return;
      }
    }
    setFormError(null);

    const homeworkAssigns = homeworkIds.map((homeworkId) => ({
      homeworkId,
      studentIds: studentIds.length ? studentIds : participantIds,
      dueAt: dueAt ? fromAppDateTimeLocalValue(dueAt) : undefined,
    }));

    void (async () => {
      const result = await completeLesson({
        lessonId: lesson.id,
        topics: nextTopics,
        attendances: participantIds
          .filter((studentId) => attendanceByStudent[studentId])
          .map((studentId) => ({
            studentId,
            status: attendanceByStudent[studentId]!,
          })),
        homeworkAssigns,
      });
      if (result.ok) onClose();
    })();
  }

  const canSave =
    participantIds.length > 0 &&
    (homeworkIds.length === 0 ||
      (assignMode === "present"
        ? presentIds.length > 0
        : selectedStudents.length > 0));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {lessonParticipantsLabel(lesson, nameOf)}. Несколько тем и ДЗ не
        списывают дополнительные занятия — посещение одно.
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
                  value={attendanceByStudent[sid] ?? null}
                  onValueChange={(v) =>
                    v &&
                    setAttendanceByStudent((prev) => ({
                      ...prev,
                      [sid]: v as AttendanceStatus,
                    }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="Ожидает отметки">
                      {(v) =>
                        attendanceStatusLabel[v as AttendanceStatus] ??
                        "Ожидает отметки"
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

        <div className="space-y-1.5">
          <Label>Темы занятия</Label>
          {pickedTopics.length === 0 ? (
            <p className="text-xs text-muted-foreground">Пока не выбраны</p>
          ) : (
            <ul className="space-y-1">
              {pickedTopics.map((t, i) => (
                <li
                  key={`${t.topicId ?? t.title}-${i}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{t.title}</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setPickedTopics((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      )
                    }
                  >
                    Убрать
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!creatingTopic ? (
            <>
              <Select
                value={topicPick || null}
                onValueChange={(v) => v && addPickedTopic(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Добавить тему из каталога">
                    {() => "Добавить тему из каталога"}
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
                Создать новую тему в каталоге
              </button>
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-border/80 p-3">
              <Label>Новая тема каталога</Label>
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
        </div>

        <div className="space-y-3 rounded-xl border border-border/80 p-3">
          <Label>Домашние задания</Label>
          {homeworkIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Необязательно. Если на занятии не было ДЗ, оставьте поле пустым.
            </p>
          ) : (
            <ul className="space-y-1">
              {homeworkIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {publishedTests.find((h) => h.id === id)?.title ?? "Тест"}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setHomeworkIds((prev) => prev.filter((x) => x !== id))
                    }
                  >
                    Убрать
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {publishedTests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет опубликованных тестов.{" "}
              <Link
                href="/kafedra/tests"
                className="font-medium underline-offset-2 hover:underline"
                onClick={onClose}
              >
                Открыть каталог тестов
              </Link>
            </p>
          ) : (
            <Select
              value={homeworkPick || null}
              onValueChange={(v) => {
                if (!v) return;
                setHomeworkIds((prev) =>
                  prev.includes(v) ? prev : [...prev, v]
                );
                setHomeworkPick("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Добавить тест">
                  {() => "Добавить тест"}
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
          )}

          {homeworkIds.length > 0 ? (
            <>
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
                      const present = attendanceByStudent[sid] === "present";
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
                    Нет присутствующих — выберите учеников вручную или отметьте
                    посещаемость.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Срок (необязательно, по Москве)</Label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
      {formError ? (
        <p className="text-sm text-destructive">{formError}</p>
      ) : null}
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
