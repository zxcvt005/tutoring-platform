"use client";

import { useParams } from "next/navigation";

import { PressFeedbackReportCard } from "@/components/pressa/feedback-report-card";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <PressFeedbackReportCard reportId={params.id} />;
}
