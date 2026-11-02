"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/layout/filter-bar";
import { HintTooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appDateKey, startOfAppMonth } from "@/lib/app-time";
import type { PressAnalyticsResult } from "@/lib/press-analytics";
import { trialAgreementStatusLabel, trialLessonStatusLabel } from "@/lib/trial-lessons";
import { apiPressGet } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type Payload = {
  analytics: PressAnalyticsResult;
  teachers: { id: string; fullName: string }[];
  owners: { id: string; fullName: string }[];
};

function monthRange() {
  const from = startOfAppMonth(new Date());
  const to = new Date();
  return { from: appDateKey(from), to: appDateKey(to) };
}

export function PressAnalyticsWorkspace() {
  const initial = monthRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [teacherId, setTeacherId] = useState("all");
  const [ownerUserId, setOwnerUserId] = useState("all");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiPressGet<Payload>("analytics", {
        from,
        to,
        teacherId: teacherId === "all" ? undefined : teacherId,
        ownerUserId: ownerUserId === "all" ? undefined : ownerUserId,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить аналитику");
    }
  }, [from, to, teacherId, ownerUserId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const a = data?.analytics;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Аналитика"
        description="Договорённость и факт проведения считаются отдельно. Конверсия «пробный → оплата» не показывается: пробный не привязан к аккаунту ученика."
      />
      <FilterBar>
        <div className="space-y-1">
          <Label className="text-xs">С</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">По</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Select value={teacherId} onValueChange={(v) => v && setTeacherId(v)}>
          <SelectTrigger className="w-[200px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Все преподаватели"
                  : data?.teachers.find((t) => t.id === v)?.fullName ??
                    "Преподаватель"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все преподаватели</SelectItem>
            {data?.teachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && data.owners.length > 1 ? (
          <Select
            value={ownerUserId}
            onValueChange={(v) => v && setOwnerUserId(v)}
          >
            <SelectTrigger className="w-[200px] rounded-full">
              <SelectValue>
                {(v) =>
                  v === "all"
                    ? "Все продажники"
                    : data.owners.find((o) => o.id === v)?.fullName ??
                      "Продажник"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все продажники</SelectItem>
              {data.owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </FilterBar>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!a ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Создано пробных"
              value={a.created}
              hint="Пробные, созданные в выбранном периоде (по дате создания)."
            />
            <Stat
              label="Договорились"
              value={a.agreed}
              hint="agreementStatus = «Договорились». Не означает, что урок уже проведён."
            />
            <Stat
              label="Не договорились"
              value={a.notAgreed}
              hint="agreementStatus = «Не договорились»."
            />
            <Stat
              label="Ещё не согласованы"
              value={a.notDiscussed}
              hint="Начальный статус «Не договаривались»."
            />
            <Stat
              label="Проведено"
              value={a.completed}
              hint="Фактический статус «Проведён». Отмены и неявки сюда не входят."
            />
            <Stat label="Отменено" value={a.cancelled} hint="Фактический статус «Отменён»." />
            <Stat label="Неявки" value={a.noShow} hint="Фактический статус «Неявка»." />
            <Stat
              label="Доля договорённостей"
              value={fmtPct(a.agreementRate)}
              hint="Договорились / созданные пробные за период."
            />
            <Stat
              label="Доля проведённых"
              value={fmtPct(a.completionRate)}
              hint={`Проведённые / запланированные и уже наступившие (${a.occurredDenominator}).`}
            />
            <Stat
              label="Доля отмен и неявок"
              value={fmtPct(a.cancelOrNoShowRate)}
              hint={`(Отмены + неявки) / запланированные и уже наступившие (${a.occurredDenominator}).`}
            />
            <Stat
              label="Активные контакты"
              value={a.contactsActive}
              hint="Сейчас назначен следующий контакт (ещё не выполнен и не отключён)."
            />
            <Stat
              label="Выполненные контакты"
              value={a.contactsCompleted}
              hint="Контакты со статусом «выполнен», у которых дата выполнения попадает в период."
            />
            <Stat
              label="Просроченные контакты"
              value={a.contactsOverdue}
              hint="Активные контакты, у которых назначенное время уже прошло."
            />
          </div>

          <section className="panel space-y-3 p-5">
            <h2 className="text-sm font-semibold">Воронка пробных уроков</h2>
            <ul className="space-y-2">
              {a.funnel.map((step) => (
                <li key={step.key} className="space-y-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{step.label}</span>
                    <span className="tabular-nums">
                      {step.count}
                      {step.percent != null ? ` · ${step.percent}%` : ""}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full bg-primary",
                        step.key === "cancelled" || step.key === "no_show"
                          ? "bg-destructive/70"
                          : ""
                      )}
                      style={{
                        width: `${Math.min(step.percent ?? 0, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Знаменатель: {step.denominator} ({step.denominatorLabel})
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold">По дням создания</h2>
              {a.byDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {a.byDay.map((d) => (
                    <li key={d.dateKey} className="flex justify-between">
                      <span>{d.dateKey}</span>
                      <span className="tabular-nums">
                        создано {d.created} · проведено {d.completed}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold">Преподаватели</h2>
              {a.byTeacher.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {a.byTeacher.map((t) => (
                    <li key={t.teacherId} className="flex justify-between">
                      <span>
                        {data.teachers.find((x) => x.id === t.teacherId)
                          ?.fullName ?? t.teacherId}
                      </span>
                      <span className="tabular-nums">
                        назначено {t.assigned} · проведено {t.completed}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold">По договорённости</h2>
              <ul className="space-y-1 text-sm">
                {(Object.keys(trialAgreementStatusLabel) as Array<
                  keyof typeof trialAgreementStatusLabel
                >).map((k) => (
                  <li key={k} className="flex justify-between">
                    <span>{trialAgreementStatusLabel[k]}</span>
                    <span className="tabular-nums">{a.byAgreement[k]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold">По факту урока</h2>
              <ul className="space-y-1 text-sm">
                {(Object.keys(trialLessonStatusLabel) as Array<
                  keyof typeof trialLessonStatusLabel
                >).map((k) => (
                  <li key={k} className="flex justify-between">
                    <span>{trialLessonStatusLabel[k]}</span>
                    <span className="tabular-nums">{a.byLessonStatus[k]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function fmtPct(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="panel space-y-1 p-4">
      <HintTooltip text={hint}>
        <p className="cursor-help text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </p>
      </HintTooltip>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
