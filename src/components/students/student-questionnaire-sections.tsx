"use client";

import type { ReactNode } from "react";

import {
  gradeLabel,
  phoneHref,
  telegramDisplay,
  telegramHref,
} from "@/lib/student-contacts";
import type { Student, StudentDirectionBalance } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Пустые значения анкеты показываем явно, не скрываем поле. */
export function questionnaireValue(
  value: string | null | undefined
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Не указано";
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[0.7rem] font-medium tracking-wide text-[#8A7A88] uppercase">
        {label}
      </p>
      <div className="text-sm leading-relaxed text-[#3F3345]">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#E8DFD4] bg-[#FFFbf7] p-5 shadow-[0_1px_0_rgba(80,60,40,0.04)]",
        className
      )}
    >
      <h2 className="font-display text-lg font-semibold tracking-tight text-[#5B4A63]">
        {title}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TelegramValue({ value }: { value: string | null | undefined }) {
  const display = telegramDisplay(value);
  if (!display) return <span className="text-[#8A7A88]">Не указано</span>;
  const href = telegramHref(value);
  if (href) {
    return (
      <a
        href={href}
        className="underline-offset-2 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {display}
      </a>
    );
  }
  return <span>{display}</span>;
}

function PhoneValue({ value }: { value: string | null | undefined }) {
  const raw = value?.trim();
  if (!raw) return <span className="text-[#8A7A88]">Не указано</span>;
  const href = phoneHref(raw);
  if (href) {
    return (
      <a href={href} className="underline-offset-2 hover:underline">
        {raw}
      </a>
    );
  }
  return <span>{raw}</span>;
}

function directionsLabel(
  balances: StudentDirectionBalance[] | undefined
): string {
  if (!balances?.length) return "Не указано";
  const names = balances
    .map((b) => b.directionName ?? b.directionSlug)
    .filter((n): n is string => Boolean(n?.trim()));
  return names.length ? names.join(", ") : "Не указано";
}

/**
 * Блоки анкеты регистрации ученика для карточки Дирекции.
 * Поля соответствуют saveStudentOnboardingProfile + контакты карточки.
 */
export function StudentQuestionnaireSections({
  student,
  teacherName,
  assignedTariffName,
}: {
  student: Student;
  teacherName?: string | null;
  assignedTariffName?: string | null;
}) {
  const emptyNotes = !student.notes?.trim();
  const emptyGoal = !student.learningGoal?.trim();
  const tariffLabel = assignedTariffName?.trim()
    ? assignedTariffName
    : student.assignedTariffId
      ? "Тариф назначен (название недоступно)"
      : "Не назначен — все тарифы";

  return (
    <div className="space-y-4">
      <Section title="Ученик">
        <Field label="ФИО ученика">{questionnaireValue(student.fullName)}</Field>
        <Field label="Telegram ученика">
          <TelegramValue value={student.telegram} />
        </Field>
        <Field label="Телефон ученика">
          <PhoneValue value={student.phone} />
        </Field>
        <Field label="Класс">
          {student.grade ? gradeLabel(student.grade) : "Не указано"}
        </Field>
      </Section>

      <Section title="Родители">
        <Field label="ФИО родителя">
          {questionnaireValue(student.parentName)}
        </Field>
        <Field
          label="Контакт родителя (Telegram или телефон)"
          className="sm:col-span-2"
        >
          <span className="whitespace-pre-wrap">
            {questionnaireValue(student.parentContacts)}
          </span>
        </Field>
      </Section>

      <Section title="Обучение">
        <Field label="Класс">
          {student.grade ? gradeLabel(student.grade) : "Не указано"}
        </Field>
        <Field label="Направление обучения">
          {directionsLabel(student.directionBalances)}
        </Field>
        <Field label="Назначенный тариф">{tariffLabel}</Field>
        <Field label="Преподаватель">
          {questionnaireValue(teacherName)}
        </Field>
        <Field label="Цель подготовки" className="sm:col-span-2">
          <span
            className={cn(
              "whitespace-pre-wrap",
              emptyGoal && "text-[#8A7A88]"
            )}
          >
            {questionnaireValue(student.learningGoal)}
          </span>
        </Field>
      </Section>

      <Section title="Дополнительная информация">
        <Field label="Дополнительная информация" className="sm:col-span-2">
          <span
            className={cn(
              "whitespace-pre-wrap",
              emptyNotes && "text-[#8A7A88]"
            )}
          >
            {questionnaireValue(student.notes)}
          </span>
        </Field>
        <Field label="Email входа">
          {questionnaireValue(student.accountEmail)}
        </Field>
        <Field label="Статус анкеты">
          {student.onboardingStatus === "complete"
            ? "Регистрация завершена"
            : student.onboardingStatus === "availability_pending"
              ? "Выбирает расписание"
              : student.onboardingStatus === "profile_pending"
                ? "Заполняет анкету"
                : student.onboardingStatus === "invited"
                  ? "Ожидает регистрации"
                  : "Не указано"}
        </Field>
      </Section>
    </div>
  );
}
