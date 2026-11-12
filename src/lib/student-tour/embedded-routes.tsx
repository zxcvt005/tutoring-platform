"use client";

import type { ReactNode } from "react";

import { AuditoriaHomePanel } from "@/components/auditoria/home-panel";
import { AuditoriaProfilePanel } from "@/components/auditoria/profile-panel";
import { LessonHistoryPanel } from "@/components/auditoria/lesson-history-panel";
import { PaymentHistoryPanel } from "@/components/auditoria/payment-history-panel";
import { PaymentCheckoutPanel } from "@/components/auditoria/payment-checkout-panel";
import { StudentIntensiveWorkspace } from "@/components/auditoria/intensive-workspace";
import { StudentTheoryWorkspace } from "@/components/auditoria/theory-workspace";
import { HomeworkWorkspace } from "@/components/homework/homework-workspace";
import { StudentTourCallsWorkspace } from "@/components/student-tour/calls-workspace";
import { StudentTourHomeworkDemoPanel } from "@/components/student-tour/homework-demo-panel";
import { StudentTourMaterialLocked } from "@/components/student-tour/material-locked";
import { STUDENT_TOUR_BASE_PATH } from "@/lib/student-tour/constants";

/** Те же экраны, что у маршрутов app/demo/student — без дублирования логики. */
export function renderStudentTourRoute(pathname: string): ReactNode {
  const base = STUDENT_TOUR_BASE_PATH;
  const path =
    pathname.split("?")[0]?.replace(/\/$/, "") || base;
  const suffix = path === base ? "" : path.startsWith(base) ? path.slice(base.length) : path;

  if (!suffix || suffix === "/") return <AuditoriaHomePanel />;
  if (suffix === "/homework") return <HomeworkWorkspace />;
  if (/^\/homework\/[^/]+$/.test(suffix)) return <StudentTourHomeworkDemoPanel />;
  if (suffix === "/theory") return <StudentTheoryWorkspace />;
  if (/^\/theory\/[^/]+$/.test(suffix)) {
    return (
      <StudentTourMaterialLocked
        title="Материал теории закрыт"
        description="Реальные материалы и ответы в демо не показываются."
      />
    );
  }
  if (suffix === "/intensivy") return <StudentIntensiveWorkspace />;
  if (/^\/intensivy\//.test(suffix)) {
    return (
      <StudentTourMaterialLocked
        title="Материал интенсива закрыт"
        description="Реальные материалы в демо не показываются."
      />
    );
  }
  if (suffix === "/history") return <LessonHistoryPanel />;
  if (/^\/history\/[^/]+$/.test(suffix)) return <LessonHistoryPanel />;
  if (suffix === "/calls") return <StudentTourCallsWorkspace />;
  if (/^\/calls\/[^/]+$/.test(suffix)) return <StudentTourCallsWorkspace />;
  if (suffix === "/pay") return <PaymentHistoryPanel />;
  if (suffix === "/pay/checkout") return <PaymentCheckoutPanel />;
  if (suffix === "/profile") return <AuditoriaProfilePanel />;

  return <AuditoriaHomePanel />;
}

export function normalizeStudentTourHref(href: string): string {
  try {
    if (href.startsWith("http")) {
      const url = new URL(href);
      return url.pathname.replace(/\/$/, "") || STUDENT_TOUR_BASE_PATH;
    }
  } catch {
    // ignore
  }
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  return path.replace(/\/$/, "") || STUDENT_TOUR_BASE_PATH;
}
