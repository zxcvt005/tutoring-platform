"use client";

import { useParams } from "next/navigation";

import { PressTeacherSchedule } from "@/components/pressa/teacher-schedule";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <PressTeacherSchedule teacherId={params.id} />;
}
