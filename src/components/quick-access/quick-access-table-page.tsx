"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import { BaseLeadsWorkspace } from "@/components/base-leads/base-leads-workspace";
import { ExpensesWorkspace } from "@/components/expenses/expenses-workspace";
import { ManualTrialLessonsWorkspace } from "@/components/manual-trial-lessons/manual-trial-lessons-workspace";
import { QuickAccessShell } from "@/components/quick-access/quick-access-shell";
import { RnpAvitoWorkspace } from "@/components/rnp-avito/rnp-avito-workspace";
import {
  QUICK_ACCESS_LABELS,
  isQuickAccessType,
  type QuickAccessType,
} from "@/lib/quick-access";
import { createQuickAccessApi } from "@/lib/store/api-client";

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
        Ссылка недоступна
      </h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function QuickAccessTablePage({
  accessType,
}: {
  accessType: QuickAccessType;
}) {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";

  const apiCall = useMemo(() => {
    if (!token || token.length < 32) return null;
    return createQuickAccessApi(token, accessType);
  }, [accessType, token]);

  if (!isQuickAccessType(accessType)) {
    return <InvalidLink message="Неизвестный тип таблицы." />;
  }

  if (!apiCall) {
    return (
      <InvalidLink message="Некорректная ссылка быстрого доступа." />
    );
  }

  return (
    <QuickAccessShell accessType={accessType}>
      <div className="quick-access-table space-y-1">
        <p className="sr-only">
          {QUICK_ACCESS_LABELS[accessType]} — редактирование без входа в кабинет
        </p>
        {accessType === "baza" ? (
          <BaseLeadsWorkspace apiCall={apiCall} />
        ) : null}
        {accessType === "rnp-avito" ? (
          <RnpAvitoWorkspace apiCall={apiCall} />
        ) : null}
        {accessType === "probnye-uroki" ? (
          <ManualTrialLessonsWorkspace apiCall={apiCall} />
        ) : null}
        {accessType === "rashody" ? (
          <ExpensesWorkspace apiCall={apiCall} />
        ) : null}
      </div>
    </QuickAccessShell>
  );
}
