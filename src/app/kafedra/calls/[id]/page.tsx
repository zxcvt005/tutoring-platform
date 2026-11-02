"use client";

import { use } from "react";

import { TeacherCallSession } from "@/components/video-calls/teacher-call-session";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TeacherCallSession callId={id} />;
}
