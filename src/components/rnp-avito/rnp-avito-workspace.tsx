"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RNP_AVITO_API_METRICS,
  RNP_AVITO_DERIVED_METRICS,
  RNP_AVITO_MANUAL_METRICS,
  type RnpAvitoDayStats,
  type RnpAvitoDerivedKey,
  type RnpAvitoMetricKey,
  type RnpAvitoMonthPayload,
  computeRnpAvitoDerived,
  derivedForDay,
  formatDayHeader,
  formatMonthTitle,
  formatRnpNumber,
  shiftMonth,
  totalsFromDays,
} from "@/lib/rnp-avito";
import { apiPlatform, HttpStatusError } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

type ManualKey = Extract<
  RnpAvitoMetricKey,
  "trialsScheduled" | "trialsCompleted"
>;

const TEXT_DEBOUNCE_MS = 450;

function todayParts(now = new Date()) {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function MetricLabelCell({
  label,
  hint,
  className,
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "sticky left-0 z-[2] min-w-[13.5rem] max-w-[13.5rem] border-b border-r border-border/70 bg-inherit px-2 py-1 text-left text-[0.72rem] font-medium leading-snug",
        className
      )}
    >
      <div>{label}</div>
      {hint ? (
        <div className="mt-0.5 text-[0.62rem] font-normal text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </td>
  );
}

function TotalCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "sticky left-[13.5rem] z-[2] min-w-[5.5rem] border-b border-r border-border/70 bg-inherit px-1.5 py-1 text-center text-[0.72rem] font-semibold tabular-nums",
        className
      )}
    >
      {children}
    </td>
  );
}

function DayCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "min-w-[3.4rem] border-b border-border/60 px-0.5 py-0.5 text-center text-[0.7rem] tabular-nums",
        className
      )}
    >
      {children}
    </td>
  );
}

export function RnpAvitoWorkspace() {
  const initial = todayParts();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [days, setDays] = useState<RnpAvitoDayStats[]>([]);
  const [apiConnected, setApiConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const daysRef = useRef(days);
  const saveGenRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistManualRef = useRef<
    | ((
        date: string,
        field: ManualKey,
        value: number | null,
        gen: number,
        retried?: boolean
      ) => Promise<void>)
    | null
  >(null);

  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  const bumpSaveGen = useCallback((key: string) => {
    const next = (saveGenRef.current.get(key) ?? 0) + 1;
    saveGenRef.current.set(key, next);
    return next;
  }, []);

  const markSaved = useCallback(() => {
    setSaveState("saved");
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveState("idle"), 1600);
  }, []);

  const loadMonth = useCallback(async (y: number, m: number) => {
    setLoadError(null);
    setReady(false);
    try {
      const data = await apiPlatform<RnpAvitoMonthPayload>("getRnpAvitoMonth", {
        year: y,
        month: m,
      });
      startTransition(() => {
        setYear(data.year);
        setMonth(data.month);
        setDays(data.days);
        setApiConnected(data.apiConnected);
        setLastSyncedAt(data.lastSyncedAt);
        setReady(true);
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
      setReady(true);
    }
  }, []);

  async function syncAvito() {
    setSyncError(null);
    setSyncing(true);
    try {
      const data = await apiPlatform<{
        year: number;
        month: number;
        syncedDays: number;
        lastSyncedAt: string;
        monthPayload: RnpAvitoMonthPayload;
      }>("syncRnpAvitoMonth", { year, month });
      setDays(data.monthPayload.days);
      setApiConnected(data.monthPayload.apiConnected);
      setLastSyncedAt(data.lastSyncedAt);
      toast.success(
        `Синхронизировано с Avito · ${data.syncedDays} дн. с данными`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось синхронизировать";
      setSyncError(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    const timers = timersRef.current;
    const savedTimer = savedTimerRef;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only month fetch
    void loadMonth(year, month);
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load
  }, []);

  const totals = useMemo(() => totalsFromDays(days), [days]);
  const monthDerived = useMemo(
    () => computeRnpAvitoDerived(totals),
    [totals]
  );

  const todayIso = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }, []);

  function goMonth(delta: number) {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
    void loadMonth(next.year, next.month);
  }

  const persistManual = useCallback(
    async (
      date: string,
      field: ManualKey,
      value: number | null,
      gen: number,
      retried = false
    ) => {
      const current = daysRef.current.find((d) => d.date === date);
      if (!current) return;
      setSaveState("saving");
      try {
        const data = await apiPlatform<{ day: RnpAvitoDayStats }>(
          "upsertRnpAvitoManualDay",
          {
            date,
            expectedManualUpdatedAt: current.manualUpdatedAt,
            [field]: value,
          }
        );
        if (saveGenRef.current.get(`${date}:${field}`) !== gen) return;
        setDays((prev) =>
          prev.map((d) => (d.date === date ? data.day : d))
        );
        markSaved();
      } catch (err) {
        if (saveGenRef.current.get(`${date}:${field}`) !== gen) return;
        const status = err instanceof HttpStatusError ? err.status : 0;
        if (status === 409 && !retried) {
          try {
            const monthData = await apiPlatform<RnpAvitoMonthPayload>(
              "getRnpAvitoMonth",
              { year, month }
            );
            const server = monthData.days.find((d) => d.date === date);
            if (server) {
              const merged: RnpAvitoDayStats = {
                ...server,
                [field]: value,
              };
              setDays((prev) =>
                prev.map((d) => (d.date === date ? merged : d))
              );
              const retryGen = bumpSaveGen(`${date}:${field}`);
              const retry = persistManualRef.current;
              if (retry) await retry(date, field, value, retryGen, true);
              return;
            }
          } catch {
            /* fall through */
          }
        }
        setSaveState("error");
        toast.error(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    },
    [bumpSaveGen, markSaved, month, year]
  );

  useEffect(() => {
    persistManualRef.current = persistManual;
  }, [persistManual]);

  const queueManual = useCallback(
    (date: string, field: ManualKey, value: number | null) => {
      const key = `${date}:${field}`;
      const gen = bumpSaveGen(key);
      const existing = timersRef.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timersRef.current.delete(key);
        void persistManual(date, field, value, gen);
      }, TEXT_DEBOUNCE_MS);
      timersRef.current.set(key, timer);
    },
    [bumpSaveGen, persistManual]
  );

  function applyLocal(date: string, field: ManualKey, value: number | null) {
    setDays((prev) =>
      prev.map((d) => (d.date === date ? { ...d, [field]: value } : d))
    );
  }

  function onManualChange(
    date: string,
    field: ManualKey,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const raw = e.target.value;
    if (raw.trim() === "") {
      applyLocal(date, field, null);
      queueManual(date, field, null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    const asInt = Math.trunc(n);
    applyLocal(date, field, asInt);
    queueManual(date, field, asInt);
  }

  function renderApiValue(value: number | null, money = false) {
    if (value == null) {
      return <span className="text-muted-foreground/50">—</span>;
    }
    return formatRnpNumber(value, money ? "money" : "int");
  }

  function renderDerived(
    key: RnpAvitoDerivedKey,
    value: number | null
  ) {
    const meta = RNP_AVITO_DERIVED_METRICS.find((m) => m.key === key)!;
    const text = formatRnpNumber(
      value,
      meta.kind === "percent" ? "percent" : "money"
    );
    return text || <span className="text-muted-foreground/50">—</span>;
  }

  const saveLabel =
    saveState === "saving"
      ? "Сохранение…"
      : saveState === "saved"
        ? "Сохранено"
        : saveState === "error"
          ? "Ошибка сохранения"
          : null;

  if (!ready && !loadError) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <PageHeader title="РНП Авито" />
        <p className="text-sm text-destructive">{loadError}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadMonth(year, month)}
        >
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="РНП Авито"
        description="Помесячная рекламная аналитика. Не связана с «Базой» и «Пробными уроками»."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {saveLabel ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  saveState === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
                aria-live="polite"
              >
                {saveLabel}
              </span>
            ) : null}
            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-card px-1 py-0.5">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Предыдущий месяц"
                onClick={() => goMonth(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums">
                {formatMonthTitle(year, month)}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Следующий месяц"
                onClick={() => goMonth(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              type="button"
              className="rounded-full"
              disabled={syncing}
              onClick={() => void syncAvito()}
            >
              {syncing ? "Синхронизация…" : "Синхронизировать с Avito"}
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {lastSyncedAt
            ? `Последняя синхронизация: ${new Date(lastSyncedAt).toLocaleString("ru-RU")}`
            : "Ещё не синхронизировано"}
        </span>
        {!apiConnected ? (
          <span>
            На сервере не заданы AVITO_CLIENT_ID / AVITO_CLIENT_SECRET /
            AVITO_USER_ID
          </span>
        ) : null}
        {syncError ? (
          <span className="text-destructive">
            {syncError}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => void syncAvito()}
            >
              Повторить
            </button>
          </span>
        ) : null}
      </div>

      <div className="max-h-[calc(100vh-10.5rem)] overflow-auto rounded-xl border border-border/80 bg-card">
        <table className="w-max min-w-full border-collapse text-[0.72rem]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-card/95 backdrop-blur-sm">
              <th className="sticky left-0 z-[3] min-w-[13.5rem] border-b border-r border-border/70 bg-card px-2 py-1.5 text-left text-[0.65rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Показатель
              </th>
              <th className="sticky left-[13.5rem] z-[3] min-w-[5.5rem] border-b border-r border-border/70 bg-card px-1.5 py-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Итого
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={cn(
                    "min-w-[3.4rem] border-b border-border/60 px-0.5 py-1.5 text-center text-[0.62rem] font-semibold tabular-nums text-muted-foreground",
                    d.date === todayIso && "bg-pastel-blue/40 text-foreground"
                  )}
                >
                  {formatDayHeader(d.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RNP_AVITO_API_METRICS.map((metric) => (
              <tr key={metric.key} className="bg-pastel-blue/35">
                <MetricLabelCell
                  label={metric.label}
                  hint={
                    lastSyncedAt
                      ? undefined
                      : apiConnected
                        ? "Данные из Avito API"
                        : "Нужна синхронизация с Avito"
                  }
                  className="bg-pastel-blue/55"
                />
                <TotalCell className="bg-pastel-blue/55">
                  {renderApiValue(
                    totals[metric.key],
                    metric.key === "budgetSpentRub"
                  )}
                </TotalCell>
                {days.map((d) => (
                  <DayCell
                    key={d.date}
                    className={cn(
                      d.date > todayIso && "bg-muted/20 text-muted-foreground/40"
                    )}
                  >
                    {d.date > todayIso
                      ? ""
                      : renderApiValue(
                          d[metric.key],
                          metric.key === "budgetSpentRub"
                        )}
                  </DayCell>
                ))}
              </tr>
            ))}

            {RNP_AVITO_MANUAL_METRICS.map((metric) => (
              <tr key={metric.key} className="bg-pastel-blue/20">
                <MetricLabelCell
                  label={metric.label}
                  className="bg-pastel-blue/40"
                />
                <TotalCell className="bg-pastel-blue/40">
                  {renderApiValue(totals[metric.key])}
                </TotalCell>
                {days.map((d) => {
                  const future = d.date > todayIso;
                  const value = d[metric.key as ManualKey];
                  return (
                    <DayCell
                      key={d.date}
                      className={cn(future && "bg-muted/20")}
                    >
                      {future ? (
                        ""
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={value ?? ""}
                          placeholder=""
                          className="h-6 border-transparent bg-transparent px-0.5 text-center text-[0.7rem] shadow-none focus-visible:border-input focus-visible:bg-background"
                          onChange={(e) =>
                            onManualChange(d.date, metric.key as ManualKey, e)
                          }
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const next =
                              raw === ""
                                ? null
                                : Number.isFinite(Number(raw))
                                  ? Math.trunc(Number(raw))
                                  : null;
                            if (next != null && next < 0) return;
                            applyLocal(d.date, metric.key as ManualKey, next);
                            const key = `${d.date}:${metric.key}`;
                            const existing = timersRef.current.get(key);
                            if (existing) clearTimeout(existing);
                            timersRef.current.delete(key);
                            void persistManual(
                              d.date,
                              metric.key as ManualKey,
                              next,
                              bumpSaveGen(key)
                            );
                          }}
                        />
                      )}
                    </DayCell>
                  );
                })}
              </tr>
            ))}

            {RNP_AVITO_DERIVED_METRICS.map((metric) => (
              <tr key={metric.key} className="bg-pastel-beige/45">
                <MetricLabelCell
                  label={metric.label}
                  className="bg-pastel-beige/70"
                />
                <TotalCell className="bg-pastel-beige/70">
                  {renderDerived(metric.key, monthDerived[metric.key])}
                </TotalCell>
                {days.map((d) => {
                  const derived = derivedForDay(d);
                  return (
                    <DayCell
                      key={d.date}
                      className={cn(
                        d.date > todayIso && "bg-muted/20 text-muted-foreground/40"
                      )}
                    >
                      {d.date > todayIso
                        ? ""
                        : renderDerived(metric.key, derived[metric.key])}
                    </DayCell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
