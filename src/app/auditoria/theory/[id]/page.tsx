"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { StudentTheoryViewer } from "@/components/auditoria/theory-viewer";

function Inner() {
  const params = useParams<{ id: string }>();
  return <StudentTheoryViewer assignmentId={String(params.id ?? "")} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка теории…</p>}>
      <Inner />
    </Suspense>
  );
}
