"use client";

import { useState } from "react";

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
      <DialogContent className="sm:max-w-md">
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
  const { data, topicsForTeacher, completeLesson, upsertTopic, sectionsForTeacher } =
    useDemoStore();
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

  const nameOf = (id: string) =>
    data.students.find((s) => s.id === id)?.fullName ?? "Ученик";
  const sections = sectionsForTeacher(lesson.teacherId);

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
    const result = completeLesson({
      lessonId: lesson.id,
      topicId: tid,
      attendances: participantIds.map((studentId) => ({
        studentId,
        status: attendanceByStudent[studentId] ?? "present",
      })),
    });
    if (result.ok) onClose();
  }

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
              onValueChange={(v) => v && setTopicId(v)}
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
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" onClick={save} disabled={participantIds.length === 0}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}
