"use client";

import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { MyTariffBlock } from "@/components/auditoria/my-tariff-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  gradeLabel,
  phoneHref,
  telegramDisplay,
  telegramHref,
} from "@/lib/student-contacts";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Student } from "@/lib/types";

function ContactLine({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">
        {href ? (
          <a
            href={href}
            className="underline-offset-2 hover:underline"
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function ProfileSettingsForm({ student }: { student: Student }) {
  const { upsertStudent, data } = useDemoStore();
  const teacher = data.teachers.find((t) => t.id === student.teacherId);
  const [telegram, setTelegram] = useState(student.telegram ?? "");
  const [phone, setPhone] = useState(student.phone ?? "");

  function saveSettings() {
    void upsertStudent({
      ...student,
      telegram: telegram.trim() || null,
      phone: phone.trim() || null,
    });
    toast.success("Контакты сохранены");
  }

  const tgDisplay = telegramDisplay(student.telegram);
  const tgLink = telegramHref(student.telegram);
  const telLink = phoneHref(student.phone);

  return (
    <div>
      <PageHeader
        title="Мой профиль"
        description="Ваши данные. Имя, класс и преподавателя меняет Дирекция."
      />

      <div className="grid max-w-xl gap-8">
        <section className="space-y-3 border-b border-border/70 pb-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Ученик
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">ФИО</dt>
              <dd className="font-display text-xl font-semibold tracking-tight">
                {student.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Класс</dt>
              <dd className="font-medium">{gradeLabel(student.grade)}</dd>
            </div>
            {tgDisplay ? (
              <ContactLine label="Telegram" value={tgDisplay} href={tgLink} />
            ) : null}
            {student.phone?.trim() ? (
              <ContactLine
                label="Телефон"
                value={student.phone.trim()}
                href={telLink}
              />
            ) : null}
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

        <section className="space-y-3 border-b border-border/70 pb-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Тариф
          </h2>
          <MyTariffBlock studentId={student.id} compact />
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Личный контакт
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-telegram">Telegram</Label>
              <Input
                id="profile-telegram"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Телефон</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 …"
              />
            </div>
          </div>
          <Button type="button" className="rounded-xl" onClick={saveSettings}>
            Сохранить
          </Button>
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
