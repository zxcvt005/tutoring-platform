"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { personStatusLabel } from "@/lib/format";
import { STUDENT_GRADES, gradeLabel } from "@/lib/student-contacts";
import type { PersonStatus, Student, StudentGrade, Teacher } from "@/lib/types";

export type StudentProfileEditValues = {
  id: string;
  fullName: string;
  grade: StudentGrade | "";
  telegram: string;
  phone: string;
  status: PersonStatus;
  teacherId: string;
  parentName: string;
  parentContacts: string;
  learningGoal: string;
  notes: string;
};

function toForm(student: Student): StudentProfileEditValues {
  return {
    id: student.id,
    fullName: student.fullName,
    grade: student.grade ?? "",
    telegram: student.telegram ?? "",
    phone: student.phone ?? "",
    status: student.status === "archived" ? "active" : student.status,
    teacherId: student.teacherId ?? "",
    parentName: student.parentName ?? "",
    parentContacts: student.parentContacts ?? "",
    learningGoal: student.learningGoal ?? "",
    notes: student.notes ?? "",
  };
}

export function StudentProfileEditDialog({
  open,
  onOpenChange,
  student,
  teachers,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  teachers: Teacher[];
  onSave: (values: StudentProfileEditValues) => Promise<boolean>;
}) {
  const [form, setForm] = useState<StudentProfileEditValues | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (open && student) {
      setForm(toForm(student));
    }
  }, [open, student]);

  async function save() {
    if (!form?.fullName.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const ok = await onSave({
        ...form,
        fullName: form.fullName.trim(),
        telegram: form.telegram.trim(),
        phone: form.phone.trim(),
        parentName: form.parentName.trim(),
        parentContacts: form.parentContacts.trim(),
        learningGoal: form.learningGoal.trim(),
        notes: form.notes.trim(),
      });
      if (ok) {
        toast.success("Карточка ученика сохранена");
        onOpenChange(false);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <DialogTitle>Редактировать ученика</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>ФИО</Label>
              <Input
                value={form.fullName}
                onChange={(e) =>
                  setForm({ ...form, fullName: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Класс</Label>
              <Select
                value={form.grade || "__none__"}
                onValueChange={(v) =>
                  v &&
                  setForm({
                    ...form,
                    grade: v === "__none__" ? "" : (v as StudentGrade),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "__none__"
                        ? gradeLabel(null)
                        : gradeLabel(String(v))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{gradeLabel(null)}</SelectItem>
                  {STUDENT_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Telegram</Label>
                <Input
                  value={form.telegram}
                  onChange={(e) =>
                    setForm({ ...form, telegram: e.target.value })
                  }
                  placeholder="@username"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                  placeholder="+7 …"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Преподаватель</Label>
              <Select
                value={form.teacherId || "__none__"}
                onValueChange={(v) =>
                  v &&
                  setForm({
                    ...form,
                    teacherId: v === "__none__" ? "" : v,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "__none__"
                        ? "Не назначен"
                        : (teachers.find((t) => t.id === v)?.fullName ?? "—")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не назначен</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  v && setForm({ ...form, status: v as PersonStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      personStatusLabel[v as PersonStatus] ?? "Статус"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {personStatusLabel.active}
                  </SelectItem>
                  <SelectItem value="paused">
                    {personStatusLabel.paused}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ФИО родителя</Label>
              <Input
                value={form.parentName}
                onChange={(e) =>
                  setForm({ ...form, parentName: e.target.value })
                }
                placeholder="Как в анкете регистрации"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Контакт родителя (Telegram или телефон)</Label>
              <Textarea
                value={form.parentContacts}
                onChange={(e) =>
                  setForm({ ...form, parentContacts: e.target.value })
                }
                placeholder="Telegram или телефон"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Цель подготовки</Label>
              <Textarea
                value={form.learningGoal}
                onChange={(e) =>
                  setForm({ ...form, learningGoal: e.target.value })
                }
                placeholder="Из анкеты ученика"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Дополнительная информация</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value })
                }
                placeholder="Из анкеты / внутренние заметки"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 rounded-none sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || !form.fullName.trim()}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
