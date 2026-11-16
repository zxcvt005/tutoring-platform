"use client";

import { Suspense } from "react";

import { IncomeWorkspace } from "@/components/income/income-workspace";

export default function DirekciyaPaymentsPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}
    >
      <IncomeWorkspace />
    </Suspense>
  );
}
