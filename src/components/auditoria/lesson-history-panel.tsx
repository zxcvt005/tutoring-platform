"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  Check,
  Clock,
  LayoutGrid,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  LessonRatingForm,
  type StudentLessonRating,
} from "@/components/auditoria/lesson-rating-form";
import { EmptyState } from "@/components/empty-state";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { formatDate, formatTime } from "@/lib/format";
import {
  assignmentsForLesson,
  attendanceForLesson,
  groupHistoryByMonth,
  historyLessonDateParts,
  historyLessonsNewestFirst,
  historyStatusPresentation,
  historyStripeClass,
  historyStripeTone,
  homeworkStillOpen,
  lessonMatchesHistoryFilter,
  topicListForLesson,
  topicTextForLesson,
  type HistoryFilterId,
  type HistoryStatusPresentation,
} from "@/lib/lesson-history";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { apiLessonRatingsGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref, useStudentTour } from "@/lib/student-tour/paths";
import { cn } from "@/lib/utils";

export function LessonHistoryPanel({ lessonId }: { lessonId?: string }) {
  const {
    data,
    lessonsForStudent,
    assignmentsForStudent,
  } = useDemoStore();
  const href = useStudentCabinetHref();
  const tour = useStudentTour();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);

  const now = useMemo(() => new Date(), []);
  const [ratings, setRatings] = useState<Record<string, StudentLessonRating>>(
    {}
  );
  const [filter, setFilter] = useState<HistoryFilterId>("all");

  const loadRatings = useCallback(async () => {
    if (tour.active) {
      setRatings({});
      return;
    }
    try {
      const data = await apiLessonRatingsGet<{ ratings: StudentLessonRating[] }>(
        "mine"
      );
      const next: Record<string, StudentLessonRating> = {};
      for (const row of data.ratings) next[row.lessonId] = row;
      setRatings(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить оценки");
    }
  }, [tour.active]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRatings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRatings]);

  const allMine = useMemo(
    () =>
      lessonsForStudent(studentId).filter((l) =>
        l.studentIds.includes(studentId)
      ),
    [lessonsForStudent, studentId]
  );
  const lessons = useMemo(
    () => historyLessonsNewestFirst(allMine, studentId, now),
    [allMine, studentId, now]
  );
  const assignments = useMemo(
    () => assignmentsForStudent(studentId),
    [assignmentsForStudent, studentId]
  );

  const selected = lessonId
    ? lessons.find((l) => l.id === lessonId)
    : null;
  const futureRequested =
    Boolean(lessonId) &&
    !selected &&
    allMine.some((l) => l.id === lessonId);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="История занятий доступна в кабинете ученика."
      />
    );
  }

  const visibleLessons = lessons.filter((lesson) =>
    lessonMatchesHistoryFilter(
      filter,
      lesson,
      attendanceForLesson(data.attendances, lesson.id, studentId)
    )
  );
  const months = groupHistoryByMonth(visibleLessons);

  const list = (
    <div className="space-y-4">
      {months.map((month, index) => (
        <section key={month.key} className="auditoria-home-card">
          {index === 0 ? (
            <div className="mb-4">
              <HistoryFilters filter={filter} onChange={setFilter} />
            </div>
          ) : null}
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {month.title}
          </h2>
          <ul className="mt-4 space-y-2">
            {month.items.map((lesson) => {
              const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
              const att = attendanceForLesson(
                data.attendances,
                lesson.id,
                studentId
              );
              const topic = topicTextForLesson(lesson, data.topics);
              const hw = assignmentsForLesson(assignments, lesson.id, studentId);
              const presentation = historyStatusPresentation(lesson, att);
              const date = historyLessonDateParts(lesson.startsAt);
              const score =
                presentation.filter === "present"
                  ? ratings[lesson.id]?.score
                  : undefined;
              const active = selected?.id === lesson.id;
              return (
                <li key={lesson.id}>
                  <Link
                    href={href(`/history/${lesson.id}`)}
                    className={cn(
                      "block min-w-0 rounded-2xl border border-black/10 border-l-[3px] bg-auditoria-surface px-3 py-3 text-sm",
                      historyStripeClass[historyStripeTone(lesson, att)],
                      active && "ring-2 ring-black/15"
                    )}
                  >
                    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 lg:grid-cols-[5.25rem_2.25rem_minmax(0,1fr)_9.5rem_auto] lg:gap-4">
                      <div className="col-start-1 row-start-1 leading-tight">
                        <p className="font-medium">{date.dayMonth}</p>
                        <p className="text-xs text-muted-foreground">{date.weekday}</p>
                      </div>
                      <HistoryStatusPill
                        presentation={presentation}
                        score={score}
                        className="col-start-2 row-start-1 justify-self-end lg:col-start-5"
                      />
                      <span className="col-start-1 row-start-2 inline-flex size-9 items-center justify-center justify-self-start rounded-xl bg-pastel-blue/70 lg:col-start-2 lg:row-start-1">
                        <BookOpen className="size-4" />
                      </span>
                      <div className="col-start-2 row-start-2 min-w-0 lg:col-start-3 lg:row-start-1">
                        <p className="font-medium break-words">{topic.title}</p>
                        <p className="text-xs break-words text-muted-foreground">
                          {teacher?.fullName ?? "Преподаватель"}
                          {hw.length > 0 ? ` · ДЗ: ${hw.length}` : ""}
                        </p>
                      </div>
                      <p className="col-span-2 row-start-3 flex items-center gap-1.5 text-sm text-muted-foreground lg:col-span-1 lg:col-start-4 lg:row-start-1">
                        <Clock className="size-3.5 shrink-0" />
                        <span className="tabular-nums">
                          {formatTime(lesson.startsAt)}–{formatTime(lesson.endsAt)}
                        </span>
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      {lessons.length === 0 ? (
        <EmptyState
          title="Пока нет занятий"
          description="Когда появятся уроки в расписании, они отобразятся здесь."
        />
      ) : (
        <div
          className={cn(
            "grid gap-4",
            selected
              ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.9fr)] xl:items-start"
              : ""
          )}
        >
          <div className={cn("min-w-0 space-y-4", selected && "hidden xl:block")}>
            {months.length === 0 ? (
              <section className="auditoria-home-card space-y-4">
                <HistoryFilters filter={filter} onChange={setFilter} />
                <EmptyState
                  title="Нет таких занятий"
                  description="В этом фильтре пока нет прошедших уроков."
                />
              </section>
            ) : (
              list
            )}
          </div>
          {selected ? (
            <div className="min-w-0">
            <LessonHistoryDetail
              lessonId={selected.id}
              studentId={studentId}
              rating={ratings[selected.id] ?? null}
              onRated={(next) =>
                setRatings((prev) => ({ ...prev, [next.lessonId]: next }))
              }
            />
            </div>
          ) : futureRequested ? (
            <EmptyState
              title="Занятие ещё не состоялось"
              description="История показывает только прошедшие уроки. Расписание — на главной странице Аудитории."
            />
          ) : (
            <p className="hidden text-sm text-muted-foreground xl:block">
              Выберите занятие, чтобы открыть подробности.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function LessonHistoryDetail({
  lessonId,
  studentId,
  rating,
  onRated,
}: {
  lessonId: string;
  studentId: string;
  rating: StudentLessonRating | null;
  onRated: (rating: StudentLessonRating) => void;
}) {
  const { data, assignmentsForStudent } = useDemoStore();
  const href = useStudentCabinetHref();
  const tour = useStudentTour();
  const now = useMemo(() => new Date(), []);
  const lesson = data.lessons.find(
    (l) => l.id === lessonId && l.studentIds.includes(studentId)
  );

  if (!lesson) {
    return (
      <EmptyState
        title="Занятие не найдено"
        description="Это занятие недоступно или принадлежит другому ученику."
      />
    );
  }

  if (new Date(lesson.startsAt).getTime() > now.getTime()) {
    return (
      <EmptyState
        title="Занятие ещё не состоялось"
        description="Карточка откроется после того, как занятие должно было начаться."
      />
    );
  }

  const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
  const att = attendanceForLesson(data.attendances, lesson.id, studentId);
  const topicItems = topicListForLesson(lesson, data.topics);
  const topic = topicTextForLesson(lesson, data.topics);
  const hw = assignmentsForLesson(
    assignmentsForStudent(studentId),
    lesson.id,
    studentId
  );

  const described = topicItems.filter((item) => item.description?.trim());
  const presentation = historyStatusPresentation(lesson, att);

  return (
    <div className="min-w-0 space-y-4">
      <Link
        href={href("/history")}
        className="inline-flex h-11 items-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm hover:bg-auditoria-surface xl:hidden"
      >
        ← К списку занятий
      </Link>
      <section className="auditoria-home-card min-w-0">
        <h2 className="font-display text-2xl font-semibold tracking-tight break-words">
          {topic.title}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {formatDate(lesson.startsAt)} · {formatTime(lesson.startsAt)}–
          {formatTime(lesson.endsAt)}
        </p>
        <p className="mt-1 text-sm">{teacher?.fullName ?? "Преподаватель"}</p>
        <div className="mt-4">
          <HistoryStatusPill presentation={presentation} />
        </div>
        {topicItems.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Темы этого занятия не указаны.
          </p>
        ) : null}
        {described.length > 0 ? (
          <div className="mt-4 space-y-3 border-t border-black/10 pt-4">
            {described.map((item, i) => {
              const showTitle =
                described.length > 1 || item.title !== topic.title;
              return (
                <div key={`${item.topicId ?? item.title}-${i}`}>
                  {showTitle ? (
                    <p className="text-sm font-medium break-words">{item.title}</p>
                  ) : null}
                  <p className="text-sm leading-relaxed break-words text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {tour.active ? null : (
        <LessonRatingForm
          lessonId={lesson.id}
          lessonStatus={lesson.status}
          startsAt={lesson.startsAt}
          attendanceStatus={att?.status}
          rating={rating}
          teacherName={teacher?.fullName}
          onSaved={onRated}
        />
      )}

      <section className="auditoria-home-card">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Домашние задания после занятия
        </h2>
        {hw.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            После этого занятия домашнее задание не назначали.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {hw.map((a) => {
              const template = data.homeworks.find((h) => h.id === a.homeworkId);
              const title = getAssignmentTitle(a, template);
              const showResult =
                (a.status === "completed" || a.status === "reviewed") &&
                a.score != null &&
                a.maxScore != null;
              const open = homeworkStillOpen(a);
              return (
                <li
                  key={a.id}
                  className={cn(
                    "flex min-w-0 flex-col gap-3 rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                    a.missedNextLesson &&
                      open &&
                      "border-[#f0d0d3] bg-pastel-rose/70"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{title}</p>
                    {showResult ? (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Результат: {a.score} из {a.maxScore}
                        {a.attempt1Percent != null
                          ? ` · 1-я: ${a.attempt1Percent}%`
                          : ""}
                        {a.attempt2Percent != null
                          ? ` · 2-я: ${a.attempt2Percent}%`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <HomeworkAssignmentStatusBadge
                      status={a.status}
                      perspective="student"
                      missedNextLesson={a.missedNextLesson}
                    />
                    {open ? (
                      <Link
                        href={href(`/homework/${a.id}`)}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-pastel-blue/80 px-4 text-sm"
                      >
                        Открыть
                      </Link>
                    ) : a.revealKeys ? (
                      <Link
                        href={href(`/homework/${a.id}`)}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm"
                      >
                        Результаты
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const HISTORY_FILTERS: {
  id: HistoryFilterId;
  label: string;
  icon: typeof LayoutGrid;
  iconClass: string;
}[] = [
  {
    id: "all",
    label: "Все занятия",
    icon: LayoutGrid,
    iconClass: "text-foreground/70",
  },
  {
    id: "present",
    label: "Был на занятии",
    icon: Check,
    iconClass: "text-[#3f7d57]",
  },
  {
    id: "missed",
    label: "Пропустил",
    icon: X,
    iconClass: "text-[#b85d66]",
  },
  {
    id: "cancelled",
    label: "Отменено",
    icon: Ban,
    iconClass: "text-[#7d7a90]",
  },
  {
    id: "pending",
    label: "Ожидает отметки",
    icon: Clock,
    iconClass: "text-[#9a7340]",
  },
];

function HistoryFilters({
  filter,
  onChange,
}: {
  filter: HistoryFilterId;
  onChange: (filter: HistoryFilterId) => void;
}) {
  return (
    <div className="@container max-w-full">
      <div className="flex max-w-full flex-wrap gap-2">
        {HISTORY_FILTERS.map((item) => {
          const Icon = item.icon;
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              aria-label={item.label}
              title={item.label}
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-auditoria-surface",
                "@min-[52rem]:h-10 @min-[52rem]:w-auto @min-[52rem]:gap-2 @min-[52rem]:px-3",
                active && "bg-pastel-blue/85"
              )}
            >
              <Icon className={cn("size-5 @min-[52rem]:size-4", item.iconClass)} />
              <span className="hidden text-sm @min-[52rem]:inline" aria-hidden>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HistoryStatusPill({
  presentation,
  score,
  className,
}: {
  presentation: HistoryStatusPresentation;
  score?: number;
  className?: string;
}) {
  const Icon =
    presentation.filter === "present"
      ? Check
      : presentation.filter === "missed"
        ? X
        : presentation.filter === "cancelled"
          ? Ban
          : Clock;
  const tone =
    presentation.filter === "present"
      ? "bg-pastel-mint/80"
      : presentation.filter === "missed"
        ? "bg-pastel-rose/80"
        : presentation.filter === "cancelled"
          ? "bg-[#eceaf3]/85"
          : "bg-pastel-beige/80";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-left text-xs leading-tight sm:text-sm",
        tone,
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="block">
          {presentation.title}
          {score != null ? ` · ${score}/10` : ""}
        </span>
        {presentation.detail ? (
          <span className="block text-[0.7rem] text-foreground/70">
            {presentation.detail}
          </span>
        ) : null}
      </span>
    </span>
  );
}
