"use client";

import { useState } from "react";

import { AuditoriaTeacherCard } from "@/components/auditoria/teacher-card";
import { CompactScheduleCard } from "@/components/auditoria/compact-schedule";
import { HomeworkProgressRings } from "@/components/homework/homework-progress-rings";
import { formulaCountPhrase } from "@/lib/landing/content";
import { cn } from "@/lib/utils";

const screens = [
  { id: "home", label: "Главная" },
  { id: "homework", label: "Задания" },
  { id: "theory", label: "Теория" },
  { id: "trainer", label: "Тренажёр" },
  { id: "calls", label: "Звонки" },
] as const;

type ScreenId = (typeof screens)[number]["id"];

const emptyHomeworkStats = {
  completedCount: 0,
  firstAttemptPercent: null,
  finalPercent: null,
  countable: 0,
  firstCorrect: 0,
  eventuallyCorrect: 0,
};

const homeworkFilters = [
  "Все задания",
  "Назначенные",
  "Просроченные",
  "Завершённые",
];

const theoryChips = [
  { title: "Видео", tone: "border-[#d3e6f4] bg-pastel-blue/80" },
  { title: "Мини-тест", tone: "border-[#d5eadc] bg-pastel-mint" },
  { title: "PDF-конспект", tone: "border-[#eadcc8] bg-pastel-beige" },
];

export function PlatformShowcase({
  formulaCount,
  trainerGroups,
}: {
  formulaCount: number;
  trainerGroups: readonly string[];
}) {
  const [screen, setScreen] = useState<ScreenId>("home");

  return (
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label="Экраны кабинета"
        className="flex gap-2 overflow-x-auto pb-3"
      >
        {screens.map((item) => {
          const selected = screen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`platform-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`platform-panel-${item.id}`}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm",
                selected
                  ? "border-foreground/20 bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted"
              )}
              onClick={() => setScreen(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="panel mt-2 min-w-0 overflow-hidden p-3 sm:p-5">
        <div
          role="tabpanel"
          id={`platform-panel-${screen}`}
          aria-labelledby={`platform-tab-${screen}`}
          className="min-w-0"
        >
          {screen === "home" ? (
            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              <AuditoriaTeacherCard teacher={null} compact />
              <CompactScheduleCard
                lessons={[]}
                studentId="landing-preview"
                attendances={[]}
              />
            </div>
          ) : null}

          {screen === "homework" ? (
            <div className="auditoria-home-card">
              <h3 className="font-display text-xl font-semibold tracking-tight">
                Домашние задания
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {homeworkFilters.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-black/10 bg-auditoria-surface px-3 py-1.5 text-sm"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-6">
                <HomeworkProgressRings stats={emptyHomeworkStats} embedded />
              </div>
            </div>
          ) : null}

          {screen === "theory" ? (
            <div className="auditoria-home-card">
              <h3 className="font-display text-xl font-semibold tracking-tight">
                Ваши материалы
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Когда преподаватель отправляет тему, в пакете появляются только
                реально приложенные части. Обычно это видео, конспект и
                мини-тест.
              </p>
              <ul className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {theoryChips.map((chip) => (
                  <li
                    key={chip.title}
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 sm:min-w-40",
                      chip.tone
                    )}
                  >
                    <p className="font-medium">{chip.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {screen === "trainer" ? (
            <div className="auditoria-home-card">
              <h3 className="font-display text-2xl font-semibold tracking-tight">
                Тренажёр формул
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {`Сформируйте тренировку и проверьте, насколько хорошо знаете формулы. В каталоге ${formulaCountPhrase(formulaCount)}. Прогресс ученика на витрине не заполнен.`}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Формул" value={String(formulaCount)} />
                <Stat label="Прогресс" value="Нет данных" />
                <Stat label="Слабые темы" value="0" />
              </div>
              <h4 className="font-display mt-6 text-lg font-semibold">
                Выбор раздела
              </h4>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {trainerGroups.map((title) => (
                  <li
                    key={title}
                    className="rounded-2xl border border-black/10 bg-pastel-blue/40 px-3 py-3 text-sm font-medium"
                  >
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {screen === "calls" ? (
            <div className="space-y-3">
              <section className="auditoria-home-card">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Stat label="всего звонков" value="—" />
                  <Stat label="общее время" value="—" />
                </div>
              </section>
              <section className="auditoria-home-card">
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  История звонков
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Занятие с преподавателем открывается в платформе. История
                  хранит прошедшие звонки. На витрине нет чужих комнат и
                  длительностей.
                </p>
              </section>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Это рабочие экраны кабинета, не макет. Имена, баллы и расписание
          учеников сюда не подставлены. История занятий — отдельный раздел
          кабинета: темы, посещаемость и оценка урока учеником.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}
