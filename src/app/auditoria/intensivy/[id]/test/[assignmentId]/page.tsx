"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { HomeworkTake } from "@/components/homework/homework-take";

function Inner() {
  const params = useParams<{ id: string; assignmentId: string }>();
  const intensiveId = String(params.id ?? "");
  const assignmentId = String(params.assignmentId ?? "");
  return (
    <HomeworkTake
      assignmentId={assignmentId}
      backHref={`/auditoria/intensivy/${intensiveId}`}
      backLabel="К интенсиву"
      takeBasePath={`/auditoria/intensivy/${intensiveId}/test/${assignmentId}`}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка теста…</p>}>
      <Inner />
    </Suspense>
  );
}
