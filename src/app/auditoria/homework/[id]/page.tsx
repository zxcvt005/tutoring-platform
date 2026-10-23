"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { HomeworkTake } from "@/components/homework/homework-take";

function HomeworkTakePageInner() {
  const params = useParams<{ id: string }>();
  return <HomeworkTake assignmentId={String(params.id ?? "")} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка задания…</p>}>
      <HomeworkTakePageInner />
    </Suspense>
  );
}
