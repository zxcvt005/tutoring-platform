"use client";

import { PressScheduleWorkspace } from "@/components/pressa/schedule-workspace";

export function PressTeacherSchedule({ teacherId }: { teacherId: string }) {
  return <PressScheduleWorkspace fixedTeacherId={teacherId} />;
}
