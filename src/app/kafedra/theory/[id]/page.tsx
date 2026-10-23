"use client";

import { useParams } from "next/navigation";

import { TheoryEditor } from "@/components/theory/theory-editor";

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? "");
  return <TheoryEditor key={id} materialId={id} />;
}
