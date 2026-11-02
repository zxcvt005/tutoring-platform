"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { StudentIntensiveViewer } from "@/components/auditoria/intensive-viewer";

function Inner() {
  const params = useParams<{ id: string }>();
  return <StudentIntensiveViewer assignmentId={String(params.id ?? "")} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка интенсива…</p>}>
      <Inner />
    </Suspense>
  );
}
