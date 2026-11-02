"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FeedbackMonthSwitcher } from "@/components/feedback/month-switcher";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackFillStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  currentFeedbackPeriod,
  type FeedbackFillStatus,
} from "@/lib/monthly-feedback";
import { apiFeedbackGet } from "@/lib/store/api-client";

type ListItem = {
  studentId: string;
  studentName: string;
  fillStatus: FeedbackFillStatus;
  metricsSummary: string;
  availableMetrics: number;
};

type ListPayload = {
  year: number;
  month: number;
  periodLabel: string;
  progress: {
    submitted: number;
    drafts: number;
    empty: number;
    total: number;
  };
  students: ListItem[];
};

export function KafedraFeedbackWorkspace() {
  const initial = currentFeedbackPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [status, setStatus] = useState<FeedbackFillStatus | "all">("all");
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFeedbackGet<ListPayload>("teacherList", {
        year: String(year),
        month: String(month),
      });
      setData(payload);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось загрузить обратную связь"
      );
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rows = useMemo(() => {
    const items = data?.students ?? [];
    if (status === "all") return items;
    return items.filter((item) => item.fillStatus === status);
  }, [data, status]);

  const progress = data?.progress;

  return (
    <div>
      <PageHeader
        title="Обратная связь"
        description="Ежемесячные комментарии по ученикам для кабинета «Пресса». Генерация текста для родителя происходит отдельно."
        actions={
          <FeedbackMonthSwitcher
            year={year}
            month={month}
            onChange={(next) => {
              setYear(next.year);
              setMonth(next.month);
            }}
          />
        }
      />
      {progress ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Отправлено {progress.submitted} из {progress.total}
          {progress.drafts > 0 ? ` · черновиков ${progress.drafts}` : ""}
        </p>
      ) : null}
      <FilterBar>
        <Select
          value={status}
          onValueChange={(v) =>
            v && setStatus(v as FeedbackFillStatus | "all")
          }
        >
          <SelectTrigger className="w-[200px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "empty"
                  ? "Не заполнена"
                  : v === "draft"
                    ? "Черновик"
                    : v === "submitted"
                      ? "Отправлена"
                      : "Все статусы"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="empty">Не заполнена</SelectItem>
            <SelectItem value="draft">Черновик</SelectItem>
            <SelectItem value="submitted">Отправлена</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Нет учеников для выбранного фильтра"
          description="Список строится по ученикам, закреплённым за вами."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((item) => (
            <li
              key={item.studentId}
              className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.studentName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.metricsSummary}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FeedbackFillStatusBadge status={item.fillStatus} />
                <Link
                  href={`/kafedra/feedback/${item.studentId}?year=${year}&month=${month}`}
                >
                  <Button type="button" size="sm" variant="outline">
                    Открыть
                  </Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
