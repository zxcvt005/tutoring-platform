"use client";

import { useParams } from "next/navigation";

import { LessonHistoryDetail } from "@/components/auditoria/lesson-history-panel";
import { useDemoStore } from "@/lib/store/demo-store";

export default function StudentTourHistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { data } = useDemoStore();
  const lessonId = params?.id ?? "";

  return (
    <LessonHistoryDetail
      lessonId={lessonId}
      studentId={data.currentStudentId}
      rating={null}
      onRated={() => undefined}
    />
  );
}
