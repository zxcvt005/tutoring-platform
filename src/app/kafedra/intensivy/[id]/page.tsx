"use client";

import { useParams } from "next/navigation";

import { IntensiveEditor } from "@/components/intensives/intensive-editor";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <IntensiveEditor intensiveId={String(params.id ?? "")} />;
}
