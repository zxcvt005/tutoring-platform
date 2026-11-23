"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
import {
  StudentEnrollmentInvites,
  type StudentEnrollmentInvitesHandle,
} from "@/components/students/student-enrollment-invites";
import { TariffBalanceNotice } from "@/components/tariff-balance-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  pressStudentBucketLabel,
  type PressStudentBucket,
  type PressStudentLastPayment,
  type PressStudentSort,
} from "@/lib/press-students";
import {
  directionBalancesLabel,
  formatRubAmount,
  minDirectionBalance,
  packageStatusFromBalance,
} from "@/lib/student-direction-balance";
import { apiPressGet } from "@/lib/store/api-client";
import type { StudentDirectionBalance } from "@/lib/types";

type Row = {
  id: string;
  fullName: string;
  status: "active" | "paused" | "archived";
  bucket: PressStudentBucket;
  teacherName: string | null;
  tariffName: string | null;
  phone: string | null;
  telegram: string | null;
  directionBalances: StudentDirectionBalance[];
  lastPayment: PressStudentLastPayment | null;
};

function lastPaymentLabel(payment: PressStudentLastPayment | null): string {
  if (!payment) return "нет данных";
  const parts: string[] = [];
  if (payment.paidAt) parts.push(formatDate(payment.paidAt));
  parts.push(formatRubAmount(payment.amount));
  if (payment.lessonsCount != null) {
    parts.push(`${payment.lessonsCount} зан.`);
  }
  return parts.join(" · ");
}

export function PressStudentsWorkspace() {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<PressStudentBucket | "all">("all");
  const [sort, setSort] = useState<PressStudentSort>("name");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const enrollmentRef = useRef<StudentEnrollmentInvitesHandle>(null);
  const [inviteCreating, setInviteCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPressGet<{ students: Row[] }>("students", {
        q: query || undefined,
        bucket,
        sort,
      });
      setRows(data.students);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить учеников");
    } finally {
      setLoading(false);
    }
  }, [query, bucket, sort]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Ученики"
        description="Все ученики школы, включая архивных. Заметки продажника ученику и преподавателю не видны."
        actions={
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={inviteCreating}
            data-testid="invite-student-button"
            onClick={() => {
              setInviteCreating(true);
              void enrollmentRef.current
                ?.createInvite()
                .finally(() => setInviteCreating(false));
            }}
          >
            {inviteCreating ? "Создание…" : "Пригласить ученика"}
          </Button>
        }
      />

      <StudentEnrollmentInvites ref={enrollmentRef} className="mb-6" />

      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени, телефону, telegram, id"
          className="sm:max-w-xs"
        />
        <Select
          value={bucket}
          onValueChange={(v) =>
            setBucket((v as PressStudentBucket | "all") ?? "all")
          }
        >
          <SelectTrigger className="w-[180px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Все статусы"
                  : pressStudentBucketLabel[v as PressStudentBucket]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="new">Новые</SelectItem>
            <SelectItem value="active">Действующие</SelectItem>
            <SelectItem value="archived">Архивные</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => setSort((v as PressStudentSort) ?? "name")}
        >
          <SelectTrigger className="w-[200px] rounded-full">
            <SelectValue>
              {(v) => (v === "status" ? "По статусу" : "По имени")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">По имени</SelectItem>
            <SelectItem value="status">По статусу</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ученики не найдены"
          description="Измените поиск или фильтр статуса."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ученик</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Преподаватель</TableHead>
                <TableHead>Тариф</TableHead>
                <TableHead className="min-w-[9rem]">Баланс</TableHead>
                <TableHead className="min-w-[10rem]">Последняя оплата</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const remaining = minDirectionBalance(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/pressa/students/${s.id}`}
                        className="font-medium hover:underline"
                      >
                        {s.fullName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {pressStudentBucketLabel[s.bucket]}
                      </p>
                      <TariffBalanceNotice
                        remaining={remaining}
                        packageStatus={packageStatusFromBalance(remaining)}
                        compact
                        className="mt-1"
                      />
                    </TableCell>
                    <TableCell>
                      <PersonStatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>{s.teacherName ?? "Не назначен"}</TableCell>
                    <TableCell>{s.tariffName ?? "—"}</TableCell>
                    <TableCell className="max-w-[12rem] text-sm">
                      {directionBalancesLabel(s)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lastPaymentLabel(s.lastPayment)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
