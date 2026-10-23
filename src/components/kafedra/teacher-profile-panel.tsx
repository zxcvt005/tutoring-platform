"use client";

import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Teacher } from "@/lib/types";

function TeacherProfileForm({ teacher }: { teacher: Teacher }) {
  const { upsertTeacher, auth } = useDemoStore();
  const [fullName, setFullName] = useState(teacher.fullName);
  const [phone, setPhone] = useState(teacher.phone ?? "");
  const [email, setEmail] = useState(teacher.email ?? "");
  const [subjects, setSubjects] = useState(teacher.subjects.join(", "));

  function save() {
    if (!fullName.trim()) return;
    upsertTeacher({
      ...teacher,
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      subjects: subjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      specializations: teacher.specializations,
    });
    toast.success("Профиль сохранён");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Мой профиль"
        description="Рабочие данные для Кафедры. Ставки и служебные заметки меняет только Дирекция."
      />

      <div className="grid max-w-xl gap-6">
        <section className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Статус</span>
            <TeacherStatusBadge status={teacher.status} />
          </div>
          <p className="text-muted-foreground">
            Email входа: {auth?.email || teacher.accountEmail || "—"}
          </p>
        </section>

        <section className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">ФИО</Label>
            <Input
              id="t-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-phone">Телефон</Label>
            <Input
              id="t-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-email">Контактный email</Label>
            <Input
              id="t-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-subjects">Предметы</Label>
            <Input
              id="t-subjects"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              placeholder="через запятую"
            />
          </div>
          <Button type="button" className="rounded-xl" onClick={save}>
            Сохранить
          </Button>
        </section>
      </div>
    </div>
  );
}

export function TeacherProfilePanel() {
  const { data } = useDemoStore();
  const teacher = data.teachers.find((t) => t.id === data.currentTeacherId);

  if (!teacher) {
    return (
      <EmptyState
        title="Профиль не найден"
        description="Нет связанного профиля преподавателя."
      />
    );
  }

  return <TeacherProfileForm key={teacher.id} teacher={teacher} />;
}
