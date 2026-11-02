"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PressRemindersWorkspace } from "@/components/pressa/reminders-workspace";
import { formatInAppZone } from "@/lib/app-time";

function todayCaption(now = new Date()) {
  const date = formatInAppZone(now, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${date} · Рабочий день`;
}

export default function PressaHomePage() {
  return (
    <div>
      <PageHeader title="Пресса" description={todayCaption()} />
      <h2 className="mb-3 text-sm font-semibold">Напоминания на сегодня</h2>
      <PressRemindersWorkspace embeddedToday />
    </div>
  );
}
