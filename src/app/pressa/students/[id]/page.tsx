"use client";

import { useParams } from "next/navigation";

import { PressStudentCard } from "@/components/pressa/student-card";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <PressStudentCard studentId={params.id} />;
}
