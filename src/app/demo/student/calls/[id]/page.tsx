"use client";

import { useParams } from "next/navigation";

import { StudentTourCallDetail } from "@/components/student-tour/calls-workspace";

export default function StudentTourCallDetailPage() {
  const params = useParams<{ id: string }>();
  return <StudentTourCallDetail callId={params?.id ?? ""} />;
}
