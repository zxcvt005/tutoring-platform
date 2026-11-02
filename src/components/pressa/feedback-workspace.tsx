"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FeedbackMonthSwitcher } from "@/components/feedback/month-switcher";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackPressStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import {
  currentFeedbackPeriod,
  type FeedbackPressStatus,
} from "@/lib/monthly-feedback";
import { apiFeedbackGet } from "@/lib/store/api-client";

type ListItem = {
  id: string;
  studentName: string;
  teacherName: string;
  periodLabel: string;
  submittedAt: string;
  pressStatus: FeedbackPressStatus;
};

type ListPayload = {
  year: number;
  month: number;
  reports: ListItem[];
};

export function PressFeedbackWorkspace() {
  const initial = currentFeedbackPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [status, setStatus] = useState<FeedbackPressStatus | "all">("pending");
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFeedbackGet<ListPayload>("pressList", {
        year: String(year),
        month: String(month),
        status,
      });
      setData(payload);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось загрузить обратную связь"
      );
    } finally {
      setLoading(false);
    }
  }, [year, month, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rows = data?.reports ?? [];

  return (
    <div>
      <PageHeader
        title="Обратная связь"
        description="Отчёты преподавателей за календарный месяц. Текст для родителя готовится через внешний ChatGPT."
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
      <FilterBar>
        <Select
          value={status}
          onValueChange={(v) =>
            v && setStatus(v as FeedbackPressStatus | "all")
          }
        >
          <SelectTrigger className="w-[220px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "pending"
                  ? "Ожидают обработки"
                  : v === "in_progress"
                    ? "В работе"
                    : v === "processed"
                      ? "Обработаны"
                      : "Все статусы"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидают обработки</SelectItem>
            <SelectItem value="in_progress">В работе</SelectItem>
            <SelectItem value="processed">Обработаны</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Нет отправленных отчётов"
          description="Здесь появляются только обратные связи, которые преподаватель отправил в Прессу."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((item) => (
            <li
              key={item.id}
              className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.studentName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.periodLabel} · {item.teacherName} · отправлено{" "}
                  {formatDateTime(item.submittedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FeedbackPressStatusBadge status={item.pressStatus} />
                <Link href={`/pressa/feedback/${item.id}`}>
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
