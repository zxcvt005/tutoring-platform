"use client";

import { use } from "react";

import { StudentCallSession } from "@/components/video-calls/student-call-session";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <StudentCallSession callId={id} />;
}
