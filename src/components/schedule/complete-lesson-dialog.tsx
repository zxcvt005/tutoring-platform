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
import { useDemoStore } from "@/lib/store/demo-store";
import type { AttendanceStatus, Lesson } from "@/lib/types";

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
  const { data, topicsForTeacher, completeLesson, upsertTopic } = useDemoStore();
  const topics = topicsForTeacher(lesson.teacherId).filter(
    (t) => t.status === "active"
  );
  const [attendance, setAttendance] = useState<AttendanceStatus>("present");
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const student = data.students.find((s) => s.id === lesson.studentId);

  function save() {
    let tid = topicId;
    if (creatingTopic) {
      if (!newTitle.trim()) return;
      tid = upsertTopic({
        teacherId: lesson.teacherId,
        title: newTitle.trim(),
        subject: lesson.subject || "Предмет",
        description: newDesc.trim() || undefined,
        status: "active",
      });
    }
    if (!tid) return;
    const result = completeLesson({
      lessonId: lesson.id,
      attendance,
      topicId: tid,
    });
    if (result.ok) onClose();
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {student?.fullName} · нужно указать посещаемость и пройденную тему.
      </p>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Посещаемость</Label>
          <Select
            value={attendance}
            onValueChange={(v) => v && setAttendance(v as AttendanceStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="present">Присутствовал</SelectItem>
              <SelectItem value="absent">Отсутствовал</SelectItem>
              <SelectItem value="cancelled">Отменено</SelectItem>
              <SelectItem value="rescheduled">Перенесено</SelectItem>
            </SelectContent>
          </Select>
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
                {topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
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
        <Button type="button" onClick={save}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}
