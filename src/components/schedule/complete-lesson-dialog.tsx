"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { fromAppDateTimeLocalValue } from "@/lib/app-time";
import { attendanceStatusLabel } from "@/lib/format";
import {
  describeClassFilterEmpty,
  filterMaterialsForStudentClass,
} from "@/lib/folders/material-class-filter";
import { gradeLabel } from "@/lib/student-contacts";
import { lessonHasOccurred } from "@/lib/kafedra-today";
import { LESSON_MARK_CONTENT_ERROR } from "@/lib/lesson-mark-requirements";
import { topicsForLesson } from "@/lib/lesson-topics";
import { uniqueStudentIds } from "@/lib/schedule";
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
    topicsForLessonCatalog,
    completeLesson,
    saveTopic,
    sectionsForTeacher,
    publishedHomeworksForLessonCatalog,
  } = useDemoStore();

  const studentId = uniqueStudentIds(lesson.studentIds)[0] ?? "";
  const student = data.students.find((s) => s.id === studentId);
  const subjectCtx = {
    lessonSubject: lesson.subject,
    directionId: lesson.directionId,
    directions: data.learningDirections,
  };

  const allTopics = topicsForLessonCatalog(lesson.teacherId);
  const topics = filterMaterialsForStudentClass(
    allTopics,
    data.materialFolders,
    { ...subjectCtx, studentGrade: student?.grade }
  );
  const publishedTests = filterMaterialsForStudentClass(
    publishedHomeworksForLessonCatalog(lesson.teacherId),
    data.materialFolders,
    { ...subjectCtx, studentGrade: student?.grade }
  );
  const emptyHint = describeClassFilterEmpty({
    ...subjectCtx,
    students: student ? [student] : [],
    studentGrade: student?.grade,
  });

  const [attendance, setAttendance] = useState<AttendanceStatus | null>(() => {
    const att = data.attendances.find(
      (a) => a.lessonId === lesson.id && a.studentId === studentId
    );
    if (
      att &&
      (att.status === "present" ||
        att.status === "absent_excused" ||
        att.status === "absent_unexcused")
    ) {
      return att.status;
    }
    return null;
  });
  const [pickedTopics, setPickedTopics] = useState<
    { topicId?: string | null; title: string }[]
  >(() =>
    topicsForLesson(lesson, allTopics).map((t) => ({
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
          a.sourceKind !== "intensive" &&
          a.lessonId === lesson.id &&
          a.studentId === studentId
      )
      .map((a) => a.homeworkId)
      .filter((id, i, arr) => arr.indexOf(id) === i)
  );
  const [homeworkPick, setHomeworkPick] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);

  const sections = sectionsForTeacher(lesson.teacherId);
  const studentName = student?.fullName ?? "Ученик";

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
    if (saveLock.current || saving || !studentId) return;

    saveLock.current = true;
    setSaving(true);
    void (async () => {
      try {
        const nextTopics = [...pickedTopics];
        if (creatingTopic) {
          if (!newTitle.trim()) {
            setFormError("Укажите название новой темы");
            return;
          }
          const created = await saveTopic({
            teacherId: lesson.teacherId,
            sectionId: null,
            title: newTitle.trim(),
            subject: lesson.subject || "Предмет",
            description: newDesc.trim() || newTitle.trim(),
            status: "active",
          });
          if (!created.ok || !created.id) {
            setFormError(created.error ?? "Не удалось создать тему");
            return;
          }
          nextTopics.push({ topicId: created.id, title: newTitle.trim() });
        }

        if (lessonHasOccurred(lesson)) {
          if (!attendance) {
            setFormError("Укажите отметку посещаемости.");
            return;
          }
          if (nextTopics.length === 0) {
            setFormError(LESSON_MARK_CONTENT_ERROR);
            return;
          }
        }
        setFormError(null);

        const due = dueAt ? fromAppDateTimeLocalValue(dueAt) : undefined;
        const homeworkAssigns = homeworkIds.map((homeworkId) => ({
          homeworkId,
          studentIds: [studentId],
          dueAt: due,
        }));

        const result = await completeLesson({
          lessonId: lesson.id,
          topics: nextTopics,
          attendances: attendance
            ? [{ studentId, status: attendance }]
            : [],
          homeworkAssigns,
        });
        if (result.ok) {
          onClose();
          return;
        }
        setFormError(
          result.error ??
            "Не удалось сохранить занятие. Проверьте темы, ДЗ и повторите."
        );
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    })();
  }

  if (!studentId) {
    return (
      <p className="text-sm text-destructive">
        У занятия не указан ученик. Создайте отдельную запись расписания.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Индивидуальное занятие:{" "}
        <span className="font-medium text-foreground">{studentName}</span>
        {" · "}
        {gradeLabel(student?.grade)}
        . Параллельные уроки в том же слоте редактируются отдельно.
      </p>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Посещаемость</Label>
          <Select
            value={attendance}
            onValueChange={(v) => v && setAttendance(v as AttendanceStatus)}
          >
            <SelectTrigger className="w-full">
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
                  {topics.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {emptyHint}
                    </div>
                  ) : (
                    topics.map((t) => {
                      const sec = sections.find((s) => s.id === t.sectionId);
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span>
                              {sec ? `${sec.title}: ${t.title}` : t.title}
                            </span>
                            <span className="text-[0.65rem] text-muted-foreground">
                              {t.libraryScope === "school"
                                ? "Общая"
                                : "Собственная"}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })
                  )}
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
          <Label>Домашнее задание</Label>
          {homeworkIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Необязательно. Назначается только этому ученику.
            </p>
          ) : (
            <ul className="space-y-1">
              {homeworkIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {publishedTests.find((h) => h.id === id)?.title ??
                      publishedHomeworksForLessonCatalog(lesson.teacherId).find(
                        (h) => h.id === id
                      )?.title ??
                      "Тест"}
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
              {emptyHint}{" "}
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
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        {h.title}
                        {h.maxScore != null ? ` · ${h.maxScore} б.` : ""}
                      </span>
                      <span className="text-[0.65rem] text-muted-foreground">
                        {h.libraryScope === "school" ? "Общая" : "Собственная"}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {homeworkIds.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Срок (необязательно, по Москве)</Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
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
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </>
  );
}
