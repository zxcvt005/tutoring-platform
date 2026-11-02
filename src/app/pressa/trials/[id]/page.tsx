"use client";

import { useParams } from "next/navigation";

import { PressTrialCard } from "@/components/pressa/trial-card";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <PressTrialCard trialId={params.id} />;
}
