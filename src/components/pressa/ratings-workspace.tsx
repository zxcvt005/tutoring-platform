"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import {
  formatTeacherLessonRating,
  groupRatingsByAppDay,
  lessonRatingPeriodLabel,
  lessonRatingTone,
  LESSON_RATING_PERIODS,
  type LessonRatingPeriod,
} from "@/lib/lesson-ratings";
import { apiLessonRatingsGet } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type RatingRow = {
  id: string;
  studentName: string;
  teacherName: string;
  score: number;
  comment: string;
  submittedAt: string;
  lessonStartsAt: string;
};

type AverageRow = {
  teacherId: string;
  teacherName: string;
  average: number | null;
  count: number;
};

type TeacherRow = { id: string; fullName: string };

type Payload = {
  ratings: RatingRow[];
  attention: RatingRow[];
  averages: AverageRow[];
  teachers: TeacherRow[];
  hasMore: boolean;
  offset: number;
};

const scoreClass: Record<"high" | "mid" | "low", string> = {
  high: "text-emerald-700",
  mid: "text-[oklch(0.45_0.08_55)]",
  low: "text-destructive",
};

function RatingCard({
  item,
  compact = false,
  active = false,
  onFocus,
}: {
  item: RatingRow;
  compact?: boolean;
  active?: boolean;
  onFocus?: (id: string) => void;
}) {
  return (
    <article
      id={`rating-${item.id}`}
      className={cn(
        "rounded-xl border border-border/80 bg-card p-3",
        active && "ring-1 ring-primary/40"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{item.studentName}</p>
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            scoreClass[lessonRatingTone(item.score)]
          )}
        >
          {item.score}/10
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Преподаватель: {item.teacherName}
      </p>
      <p className="text-xs text-muted-foreground">
        Занятие: {formatDateTime(item.lessonStartsAt)}
        {compact ? "" : ` · отправлено ${formatDateTime(item.submittedAt)}`}
      </p>
      {item.comment ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
          {item.comment}
        </p>
      ) : compact ? null : (
        <p className="mt-2 text-sm text-muted-foreground">Без комментария</p>
      )}
      {onFocus ? (
        <button
          type="button"
          className="mt-2 text-xs text-primary hover:underline"
          onClick={() => onFocus(item.id)}
        >
          Открыть в истории
        </button>
      ) : null}
    </article>
  );
}

export function PressRatingsWorkspace() {
  const [period, setPeriod] = useState<LessonRatingPeriod>("current_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [teacherId, setTeacherId] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const load = useCallback(
    async (offset = 0, append = false) => {
      if (period === "custom" && (!from || !to)) {
        setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const payload = await apiLessonRatingsGet<Payload>("press", {
          period,
          from: period === "custom" ? from : undefined,
          to: period === "custom" ? to : undefined,
          teacherId: teacherId === "all" ? undefined : teacherId,
          attentionOnly: attentionOnly ? "1" : undefined,
          offset: offset ? String(offset) : undefined,
        });
        setData((prev) =>
          append && prev
            ? {
                ...payload,
                ratings: [...prev.ratings, ...payload.ratings],
              }
            : payload
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Не удалось загрузить оценки"
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [period, from, to, teacherId, attentionOnly]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(0, false), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const groups = useMemo(
    () => groupRatingsByAppDay(data?.ratings ?? []),
    [data]
  );

  function focusRating(id: string) {
    setFocusId(id);
    setAttentionOnly(true);
    window.setTimeout(() => {
      document.getElementById(`rating-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }

  return (
    <div>
      <PageHeader
        title="Отметки учеников"
        description="Оценки проведённых занятий. Комментарий предлагается при оценке 1–6."
      />
      <FilterBar>
        <Select
          value={period}
          onValueChange={(v) =>
            v && setPeriod(v as LessonRatingPeriod)
          }
        >
          <SelectTrigger className="w-[200px] rounded-full">
            <SelectValue>
              {(v) =>
                lessonRatingPeriodLabel[(v as LessonRatingPeriod) ?? "current_month"]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LESSON_RATING_PERIODS.map((key) => (
              <SelectItem key={key} value={key}>
                {lessonRatingPeriodLabel[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {period === "custom" ? (
          <>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px]"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px]"
            />
          </>
        ) : null}
        <Select
          value={teacherId}
          onValueChange={(v) => v && setTeacherId(v)}
        >
          <SelectTrigger className="w-[220px] rounded-full">
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
            {(data?.teachers ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant={attentionOnly ? "default" : "outline"}
          onClick={() => setAttentionOnly((v) => !v)}
        >
          Требуют внимания
        </Button>
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Средний рейтинг преподавателей</h2>
            {loading && !data ? (
              <p className="mt-2 text-sm text-muted-foreground">Загрузка…</p>
            ) : (data?.averages ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Нет оценок</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {(data?.averages ?? []).map((row) => (
                  <li key={row.teacherId}>
                    {formatTeacherLessonRating(
                      row.teacherName,
                      row.average,
                      row.count
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {loading && !data ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : groups.length === 0 ? (
            <EmptyState
              title="За выбранный период оценок пока нет"
              description="Здесь появятся только отправленные оценки занятий."
            />
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.dateKey}>
                  <h2 className="mb-2 font-display text-base font-semibold capitalize">
                    {group.label}
                  </h2>
                  <ul className="space-y-2">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <RatingCard
                          item={item}
                          active={focusId === item.id}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {data?.hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void load(data.ratings.length, true)}
                >
                  {loadingMore ? "Загрузка…" : "Показать ещё"}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <aside className="panel p-4 xl:sticky xl:top-4">
          <h2 className="text-sm font-semibold">Требуют внимания</h2>
          {(data?.attention ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Нет оценок, требующих внимания
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(data?.attention ?? []).map((item) => (
                <li key={item.id}>
                  <RatingCard
                    item={item}
                    compact
                    onFocus={focusRating}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
