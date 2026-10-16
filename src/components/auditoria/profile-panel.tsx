"use client";

import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Student } from "@/lib/types";

function ProfileSettingsForm({ student }: { student: Student }) {
  const { upsertStudent, data } = useDemoStore();
  const teacher = data.teachers.find((t) => t.id === student.teacherId);
  const [contacts, setContacts] = useState(student.contacts ?? "");
  const [notes, setNotes] = useState(student.notes ?? "");

  function saveSettings() {
    upsertStudent({
      ...student,
      contacts: contacts.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    toast.success("Настройки сохранены");
  }

  return (
    <div>
      <PageHeader
        title="Мой профиль"
        description="Ваши данные в прототипе. Родительского кабинета нет."
      />

      <div className="grid max-w-xl gap-8">
        <section className="space-y-3 border-b border-border/70 pb-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Ученик
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Имя</dt>
              <dd className="font-display text-xl font-semibold tracking-tight">
                {student.fullName}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Статус</dt>
              <dd>
                <PersonStatusBadge status={student.status} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3 border-b border-border/70 pb-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Преподаватель
          </h2>
          {teacher ? (
            <div className="text-sm">
              <p className="font-medium">{teacher.fullName}</p>
              <p className="text-muted-foreground">
                {teacher.subjects.join(", ")}
                {teacher.email ? ` · ${teacher.email}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Преподаватель не назначен.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Настройки
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="profile-contacts">Контакт для связи</Label>
            <Input
              id="profile-contacts"
              value={contacts}
              onChange={(e) => setContacts(e.target.value)}
              placeholder="Телефон или email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-notes">Заметка для себя</Label>
            <Textarea
              id="profile-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например, цель на четверть"
            />
          </div>
          <Button type="button" className="rounded-xl" onClick={saveSettings}>
            Сохранить
          </Button>
          <p className="text-xs text-muted-foreground">
            Имя и назначение преподавателя меняет Дирекция; здесь — только
            доступные ученику поля.
          </p>
        </section>
      </div>
    </div>
  );
}

export function AuditoriaProfilePanel() {
  const { data } = useDemoStore();
  const student = data.students.find((s) => s.id === data.currentStudentId);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  return <ProfileSettingsForm key={student.id} student={student} />;
}
