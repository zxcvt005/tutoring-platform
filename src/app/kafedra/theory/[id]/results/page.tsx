"use client";

import { useParams } from "next/navigation";

import { TheoryResults } from "@/components/theory/theory-results";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <TheoryResults materialId={String(params.id ?? "")} />;
}
