import { Badge } from "@/components/ui/badge";
import {
  assignmentStatusLabel,
  attendanceStatusLabel,
  lessonStatusLabel,
  personStatusLabel,
  resultStatusLabel,
} from "@/lib/format";
import type {
  AssignmentStatus,
  AttendanceStatus,
  LessonStatus,
  PersonStatus,
  ResultStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger" | "muted" | "warn";

const toneClass: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success: "border-transparent bg-success/15 text-success",
  danger: "border-transparent bg-destructive/15 text-destructive",
  muted: "border-border bg-background text-muted-foreground",
  warn: "border-transparent bg-amber-500/15 text-amber-800",
};

function StatusPill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md font-normal", toneClass[tone], className)}
    >
      {label}
    </Badge>
  );
}

export function PersonStatusBadge({ status }: { status: PersonStatus }) {
  return (
    <StatusPill
      label={personStatusLabel[status]}
      tone={status === "active" ? "success" : "muted"}
    />
  );
}

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  const tone: Tone =
    status === "done"
      ? "success"
      : status === "cancelled"
        ? "danger"
        : "neutral";
  return <StatusPill label={lessonStatusLabel[status]} tone={tone} />;
}

export function AttendanceStatusBadge({
  status,
}: {
  status: AttendanceStatus;
}) {
  const tone: Tone =
    status === "present"
      ? "success"
      : status === "absent"
        ? "danger"
        : status === "late"
          ? "warn"
          : "muted";
  return <StatusPill label={attendanceStatusLabel[status]} tone={tone} />;
}

export function AssignmentStatusBadge({
  status,
}: {
  status: AssignmentStatus;
}) {
  const tone: Tone =
    status === "published"
      ? "success"
      : status === "closed"
        ? "muted"
        : "neutral";
  return <StatusPill label={assignmentStatusLabel[status]} tone={tone} />;
}

export function ResultStatusBadge({ status }: { status: ResultStatus }) {
  const tone: Tone =
    status === "graded"
      ? "success"
      : status === "overdue"
        ? "danger"
        : status === "submitted"
          ? "warn"
          : "neutral";
  return <StatusPill label={resultStatusLabel[status]} tone={tone} />;
}
