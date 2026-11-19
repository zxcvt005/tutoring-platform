"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TopicSuggestField } from "@/components/kafedra/topic-suggest-field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  describeClassFilterEmpty,
  filterMaterialsForStudentClass,
} from "@/lib/folders/material-class-filter";
import {
  canAddAnotherTopic,
  draftTopicsFromSaved,
  isDuplicateTopic,
  newDraftTopicKey,
  normalizeDraftTopics,
  type DraftLessonTopic,
} from "@/lib/lesson-topics-draft";
import { topicsForLesson } from "@/lib/lesson-topics";
import { attendanceStatusLabel } from "@/lib/format";
import {
  isFinalAttendanceStatus,
  lessonHasOccurred,
  studentAttendanceMarkBinary,
  attendanceMarkBinaryLabel,
} from "@/lib/kafedra-today";
import { useDemoStore } from "@/lib/store/demo-store";
import type {
  AttendanceStatus,
  Homework,
  HomeworkAssignment,
  Lesson,
} from "@/lib/types";

const ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  "present",
  "absent_excused",
  "absent_unexcused",
];

type DraftHw = { homeworkId: string; assignmentId?: string };

function isActiveLessonHomework(a: HomeworkAssignment): boolean {
  return (
    a.sourceKind !== "theory" &&
    a.sourceKind !== "intensive" &&
    a.status !== "withdrawn"
  );
}

export function LessonContentEditor({
  lesson,
  studentId,
  required = false,
}: {
  lesson: Lesson;
  studentId: string;
  required?: boolean;
}) {
  const {
    data,
    topicsForLessonCatalog,
    publishedHomeworksForLessonCatalog,
    saveLessonContent,
  } = useDemoStore();
  // Занятие 1:1 — класс и направление только этого ученика / этого урока.
  const student = data.students.find((s) => s.id === studentId);
  const subjectCtx = useMemo(
    () => ({
      lessonSubject: lesson.subject,
      directionId: lesson.directionId,
      directions: data.learningDirections,
    }),
    [lesson.subject, lesson.directionId, data.learningDirections]
  );
  const allTopics = topicsForLessonCatalog(lesson.teacherId);
  const allTests = publishedHomeworksForLessonCatalog(lesson.teacherId);
  const catalog = useMemo(
    () =>
      filterMaterialsForStudentClass(allTopics, data.materialFolders, {
        ...subjectCtx,
        studentGrade: student?.grade,
      }),
    [allTopics, data.materialFolders, subjectCtx, student?.grade]
  );
  const tests = useMemo(
    () =>
      filterMaterialsForStudentClass(allTests, data.materialFolders, {
        ...subjectCtx,
        studentGrade: student?.grade,
      }),
    [allTests, data.materialFolders, subjectCtx, student?.grade]
  );
  const emptyHint = describeClassFilterEmpty({
    ...subjectCtx,
    students: student ? [student] : [],
    studentGrade: student?.grade,
  });
  const savedTopics = useMemo(
    () =>
      topicsForLesson(lesson, allTopics).map((t) => ({
        topicId: t.topicId ?? null,
        title: t.title,
      })),
    [lesson, allTopics]
  );
  const savedAssignments = data.homeworkAssignments.filter(
    (a) =>
      a.lessonId === lesson.id &&
      a.studentId === studentId &&
      isActiveLessonHomework(a)
  );
  const savedAssignmentKey = savedAssignments
    .map((a) => `${a.id}:${a.homeworkId}`)
    .join("|");
  const [topics, setTopics] = useState<DraftLessonTopic[]>(() =>
    draftTopicsFromSaved(savedTopics)
  );
  const [hw, setHw] = useState<DraftHw[]>(() =>
    savedAssignments.map((a) => ({
      homeworkId: a.homeworkId,
      assignmentId: a.id,
    }))
  );
  const [testId, setTestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupHint, setDupHint] = useState<string | null>(null);
  const [requiredHint, setRequiredHint] = useState<string | null>(null);
  const existingAtt = data.attendances.find(
    (a) => a.lessonId === lesson.id && a.studentId === studentId
  );
  const [attendance, setAttendance] = useState<AttendanceStatus | null>(() => {
    if (
      existingAtt &&
      (existingAtt.status === "present" ||
        existingAtt.status === "absent_excused" ||
        existingAtt.status === "absent_unexcused")
    ) {
      return existingAtt.status;
    }
    return null;
  });
  const markBinary = studentAttendanceMarkBinary(
    lesson,
    studentId,
    data.attendances
  );
  // Подтянуть сохранённые назначения после reload, не затирая несохранённый черновик.
  useEffect(() => {
    setHw((prev) => {
      const unsaved = prev.filter((item) => !item.assignmentId);
      const fromServer = savedAssignments.map((a) => ({
        homeworkId: a.homeworkId,
        assignmentId: a.id,
      }));
      const serverIds = new Set(fromServer.map((x) => x.homeworkId));
      const pending = unsaved.filter((x) => !serverIds.has(x.homeworkId));
      return [...fromServer, ...pending];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ключ стабилизирует список назначений
  }, [savedAssignmentKey]);

  // Актуальный класс/направление ученика — сбросить выбор вне нового фильтра.
  if (testId && !tests.some((t) => t.id === testId)) {
    setTestId("");
  }

  function updateTopic(
    index: number,
    title: string,
    topicId: string | null
  ) {
    if (isDuplicateTopic(topics, index, title, topicId)) {
      setDupHint("Эта тема уже добавлена к занятию");
      return;
    }
    setDupHint(null);
    setTopics((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, title, topicId } : t
      )
    );
  }

  function addTopicField() {
    if (!canAddAnotherTopic(topics)) return;
    setTopics((prev) => [
      ...prev,
      { key: newDraftTopicKey(), topicId: null, title: "" },
    ]);
  }

  function removeTopicField(index: number) {
    setTopics((prev) => {
      if (prev.length <= 1) {
        return [{ key: prev[0]?.key ?? newDraftTopicKey(), topicId: null, title: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
    setDupHint(null);
  }

  function homeworkTitle(id: string) {
    const hwItem =
      allTests.find((t) => t.id === id) ??
      data.homeworks.find((h) => h.id === id);
    return hwItem?.title || "Тест";
  }

  async function save() {
    setBusy(true);
    setRequiredHint(null);
    try {
      const normalized = normalizeDraftTopics(topics);
      if (required && normalized.length === 0) {
        setRequiredHint("Укажите хотя бы одну тему занятия.");
        return;
      }
      const needsAttendance =
        (required || lessonHasOccurred(lesson)) &&
        !isFinalAttendanceStatus(existingAtt?.status);
      if (needsAttendance && !attendance) {
        setRequiredHint("Укажите отметку посещаемости.");
        return;
      }
      const draftHw = [...hw];
      const homeworkIds = draftHw.map((item) => item.homeworkId);
      const result = await saveLessonContent({
        lessonId: lesson.id,
        studentId,
        topics: normalized,
        homeworkIds,
        attendanceStatus: attendance,
      });
      if (!result.ok) {
        toast.error(
          result.error ??
            "Не удалось сохранить темы, отметку и домашние задания. Повторите."
        );
        return;
      }
      const created = result.created ?? 0;
      toast.success(
        created > 0
          ? `Сохранено. Отметка и ДЗ обновлены (новых ДЗ: ${created})`
          : "Темы, отметка и домашние задания сохранены"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">Отметка</p>
        <span
          className={
            markBinary === "marked"
              ? "rounded-full bg-pastel-mint px-2.5 py-1 text-xs text-[#3f6b52]"
              : "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          }
        >
          {attendanceMarkBinaryLabel(markBinary)}
        </span>
        <Select
          value={attendance}
          onValueChange={(v) => v && setAttendance(v as AttendanceStatus)}
        >
          <SelectTrigger className="h-8 min-w-[200px] flex-1">
            <SelectValue placeholder="Выбрать посещаемость">
              {() =>
                attendance
                  ? attendanceStatusLabel[attendance]
                  : "Выбрать посещаемость"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ATTENDANCE_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {attendanceStatusLabel[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
        {topics.map((t, index) => {
          const excludeIds = new Set(
            topics
              .filter((x, i) => i !== index && x.topicId)
              .map((x) => x.topicId as string)
          );
          const excludeTitles = new Set(
            topics
              .filter((x, i) => i !== index && x.title.trim())
              .map((x) => x.title.trim().toLowerCase())
          );
          return (
            <div key={t.key} className="space-y-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TopicSuggestField
                    topics={catalog}
                    value={t.title}
                    inputId={`lesson-topic-${t.key}`}
                    label={
                      index === 0 ? "Тема занятия" : `Тема занятия ${index + 1}`
                    }
                    excludeTopicIds={excludeIds}
                    excludeTitles={excludeTitles}
                    hint={
                      index === 0
                        ? "Свободный текст не создаёт тему в каталоге."
                        : null
                    }
                    disabled={busy}
                    onCommit={(title, topicId) =>
                      updateTopic(index, title, topicId)
                    }
                  />
                </div>
                {topics.length > 1 ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="mt-5 shrink-0"
                    disabled={busy}
                    onClick={() => removeTopicField(index)}
                  >
                    Убрать
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {dupHint ? (
          <p className="text-xs text-destructive">{dupHint}</p>
        ) : null}
        {canAddAnotherTopic(topics) ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full text-xs"
            disabled={busy}
            onClick={addTopicField}
          >
            + Добавить ещё тему
          </Button>
        ) : null}
      </div>

      <HomeworkDraftList
        tests={tests}
        emptyHint={emptyHint}
        assignments={savedAssignments}
        hw={hw}
        testId={testId}
        busy={busy}
        homeworkTitle={homeworkTitle}
        onTestId={setTestId}
        onAdd={() => {
          if (!testId) return;
          // Только из отфильтрованного каталога класса ученика.
          if (!tests.some((t) => t.id === testId)) return;
          setHw((prev) =>
            prev.some((x) => x.homeworkId === testId)
              ? prev
              : [...prev, { homeworkId: testId }]
          );
          setTestId("");
        }}
        onRemove={(index, item) => {
          const assignment = item.assignmentId
            ? savedAssignments.find((a) => a.id === item.assignmentId)
            : undefined;
          if (assignment && assignment.status !== "assigned") return;
          setHw((prev) => prev.filter((_, i) => i !== index));
        }}
      />

      {requiredHint ? (
        <p className="text-xs text-destructive">{requiredHint}</p>
      ) : required ? (
        <p className="text-xs text-muted-foreground">
          Чтобы отметить посещаемость, укажите тему. Домашнее задание можно не
          назначать.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() => void save()}
        >
          Сохранить темы и ДЗ
        </Button>
      </div>
    </div>
  );
}

function HomeworkDraftList({
  tests,
  emptyHint,
  assignments,
  hw,
  testId,
  busy,
  homeworkTitle,
  onTestId,
  onAdd,
  onRemove,
}: {
  tests: Homework[];
  emptyHint: string;
  assignments: HomeworkAssignment[];
  hw: DraftHw[];
  testId: string;
  busy: boolean;
  homeworkTitle: (id: string) => string;
  onTestId: (id: string) => void;
  onAdd: () => void;
  onRemove: (index: number, item: DraftHw) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">
        Домашние задания
      </p>
      {hw.length === 0 ? (
        <p className="text-xs text-muted-foreground">Пока не назначено</p>
      ) : (
        <ul className="space-y-1">
          {hw.map((item, i) => {
            const assignment = item.assignmentId
              ? assignments.find((a) => a.id === item.assignmentId)
              : undefined;
            const started = assignment ? assignment.status !== "assigned" : false;
            return (
              <li
                key={`${item.assignmentId ?? item.homeworkId}-${i}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{homeworkTitle(item.homeworkId)}</span>
                {started ? (
                  <span className="text-[0.7rem] text-muted-foreground">
                    Уже выполняется
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onRemove(i, item)}
                  >
                    Убрать
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tests.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="flex gap-2">
          <Select value={testId} onValueChange={(v) => v && onTestId(v)}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue>
                {() => (testId ? homeworkTitle(testId) : "Выбрать тест")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tests.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{homeworkTitle(item.id)}</span>
                    <span className="text-[0.65rem] text-muted-foreground">
                      {item.libraryScope === "school" ? "Общая" : "Собственная"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={busy || !testId}
            onClick={onAdd}
          >
            Добавить
          </Button>
        </div>
      )}
    </div>
  );
}
