import { Badge } from "@/components/ui/badge";
import {
  attendanceStatusLabel,
  homeworkAssignmentStatusLabel,
  lessonStatusLabel,
  personStatusLabel,
  studentHomeworkStatusLabel,
  teacherStatusLabel,
  theoryAssignmentStatusLabel,
  theoryStatusLabel,
  topicStatusLabel,
} from "@/lib/format";
import type {
  AttendanceStatus,
  HomeworkAssignmentStatus,
  LessonStatus,
  PersonStatus,
  TeacherStatus,
  TheoryAssignmentStatus,
  TheoryStatus,
  TopicStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger" | "muted" | "warn";

const toneClass: Record<Tone, string> = {
  neutral: "border-border/80 bg-muted/80 text-foreground",
  success: "border-transparent bg-success/12 text-success",
  danger: "border-transparent bg-destructive/12 text-destructive",
  muted: "border-border/70 bg-background text-muted-foreground",
  warn: "border-transparent bg-[oklch(0.95_0.04_85)] text-[oklch(0.45_0.08_55)]",
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
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
        toneClass[tone],
        className
      )}
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

export function TeacherStatusBadge({ status }: { status: TeacherStatus }) {
  const tone: Tone =
    status === "active" ? "success" : status === "inactive" ? "warn" : "muted";
  return <StatusPill label={teacherStatusLabel[status]} tone={tone} />;
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
      : status === "absent_unexcused"
        ? "danger"
        : status === "absent_excused" || status === "rescheduled"
          ? "warn"
          : "muted";
  return <StatusPill label={attendanceStatusLabel[status]} tone={tone} />;
}

export function TopicStatusBadge({ status }: { status: TopicStatus }) {
  return (
    <StatusPill
      label={topicStatusLabel[status]}
      tone={status === "active" ? "success" : "muted"}
    />
  );
}

export function TheoryStatusBadge({ status }: { status: TheoryStatus }) {
  const tone: Tone =
    status === "published" ? "success" : status === "draft" ? "warn" : "muted";
  return <StatusPill label={theoryStatusLabel[status]} tone={tone} />;
}

export function TheoryAssignmentStatusBadge({
  status,
}: {
  status: TheoryAssignmentStatus;
}) {
  const tone: Tone =
    status === "completed"
      ? "success"
      : status === "awaiting_review"
        ? "warn"
        : status === "assigned"
          ? "neutral"
          : "warn";
  return <StatusPill label={theoryAssignmentStatusLabel[status]} tone={tone} />;
}

export function HomeworkAssignmentStatusBadge({
  status,
  perspective = "staff",
  missedNextLesson = false,
}: {
  status: HomeworkAssignmentStatus;
  /** staff — Дирекция/Кафедра; student — Аудитория */
  perspective?: "staff" | "student";
  missedNextLesson?: boolean;
}) {
  const showMissed =
    missedNextLesson &&
    status !== "completed" &&
    status !== "reviewed";
  const tone: Tone = showMissed
    ? "danger"
    : status === "reviewed"
      ? "success"
      : status === "overdue"
        ? "danger"
        : status === "completed" ||
            status === "in_progress" ||
            status === "remaining_questions" ||
            status === "attempt2_in_progress"
          ? "warn"
          : status === "attempt1_submitted"
            ? "success"
            : "neutral";
  const label = showMissed
    ? "Не выполнено к следующему занятию"
    : perspective === "student"
      ? studentHomeworkStatusLabel[status]
      : homeworkAssignmentStatusLabel[status];
  return <StatusPill label={label} tone={tone} />;
}
