"use client";

import { use } from "react";

import { ErrorPracticeTake } from "@/components/homework/error-practice-take";

export default function AuditoriaErrorPracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return <ErrorPracticeTake sessionId={sessionId} />;
}
