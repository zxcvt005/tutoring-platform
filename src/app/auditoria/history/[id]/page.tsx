import { LessonHistoryPanel } from "@/components/auditoria/lesson-history-panel";

export default async function AuditoriaHistoryLessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LessonHistoryPanel lessonId={id} />;
}
