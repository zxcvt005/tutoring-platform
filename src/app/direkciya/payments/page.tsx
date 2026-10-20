"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

export default function DirekciyaPaymentsPage() {
  const { data, ready } = useDemoStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...data.payments].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [data.payments]
  );

  async function markPaid(paymentId: string) {
    const reason = window.prompt(
      "Причина ручной фиксации оплаты (обязательно):"
    );
    if (!reason || reason.trim().length < 3) return;
    setBusyId(paymentId);
    try {
      await apiPlatform("adminMarkPaymentPaid", { paymentId, reason });
      toast.success("Оплата зафиксирована");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Платежи"
        description="Финансовые события по назначениям тарифов. Ручная фиксация — только с причиной и журналом."
      />
      {rows.length === 0 ? (
        <EmptyState title="Платежей пока нет" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Когда</TableHead>
              <TableHead>Ученик</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Провайдер</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const student = data.students.find((s) => s.id === p.studentId);
              return (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums text-sm">
                    {formatDateTime(p.createdAt)}
                  </TableCell>
                  <TableCell>{student?.fullName ?? p.studentId}</TableCell>
                  <TableCell className="tabular-nums">
                    {p.amount.toLocaleString("ru-RU")} ₽
                  </TableCell>
                  <TableCell>{p.status}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.provider}
                  </TableCell>
                  <TableCell>
                    {p.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busyId === p.id}
                        onClick={() => void markPaid(p.id)}
                      >
                        Отметить оплаченным
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
