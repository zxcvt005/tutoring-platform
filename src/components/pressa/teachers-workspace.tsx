"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherStatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { useDemoStore } from "@/lib/store/demo-store";

export function PressTeachersWorkspace() {
  const { data } = useDemoStore();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.teachers
      .filter((t) => t.status !== "archived")
      .filter((t) =>
        !q
          ? true
          : t.fullName.toLowerCase().includes(q) ||
            t.subjects.some((s) => s.toLowerCase().includes(q))
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }, [data.teachers, query]);

  return (
    <div>
      <PageHeader
        title="Преподаватели"
        description="Откройте расписание, чтобы подобрать время пробного урока. Обычные занятия только для просмотра."
      />
      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени или предмету"
          className="sm:max-w-xs"
        />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="Преподаватели не найдены" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/pressa/teachers/${t.id}`}
                className="panel flex h-full flex-col gap-2 p-4 hover:border-foreground/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{t.fullName}</p>
                  <TeacherStatusBadge status={t.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t.subjects.join(", ") || "Предметы не указаны"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
