"use client";

import { useParams, useSearchParams } from "next/navigation";

import { KafedraFeedbackStudentCard } from "@/components/kafedra/feedback-student-card";

export default function Page() {
  const params = useParams<{ studentId: string }>();
  const search = useSearchParams();
  return (
    <KafedraFeedbackStudentCard
      studentId={params.studentId}
      year={search.get("year") ?? undefined}
      month={search.get("month") ?? undefined}
    />
  );
}
