"use client";

import { initialsFromName } from "@/lib/format";
import type { Teacher } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AuditoriaTeacherCard({
  teacher,
  compact = false,
}: {
  teacher: Teacher | null;
  compact?: boolean;
}) {
  const home = compact;

  if (!teacher) {
    return (
      <section
        className={
          home
            ? "auditoria-home-card"
            : "rounded-2xl border border-border/70 bg-auditoria-surface p-5"
        }
      >
        <p className="text-sm text-muted-foreground">Преподаватель</p>
        <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
          Пока не назначен
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Школа назначит преподавателя — после этого здесь появится его профиль.
        </p>
      </section>
    );
  }

  const initials = teacher.avatarInitials || initialsFromName(teacher.fullName);

  return (
    <section
      className={
        home
          ? "auditoria-home-card"
          : "rounded-2xl border border-border/70 bg-auditoria-surface p-5"
      }
    >
      <p className="text-sm text-muted-foreground">Преподаватель</p>
      <div className={cn("mt-4 flex gap-4", !home && "mt-3")}>
        {teacher.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={teacher.photoUrl}
            alt=""
            className={
              home
                ? "size-16 shrink-0 rounded-2xl object-cover sm:size-[4.5rem]"
                : "size-20 shrink-0 rounded-2xl object-cover sm:size-24"
            }
          />
        ) : (
          <div
            className={
              home
                ? "flex size-16 shrink-0 items-center justify-center rounded-2xl bg-pastel-blue font-display text-lg font-semibold text-foreground sm:size-[4.5rem]"
                : "flex size-20 shrink-0 items-center justify-center rounded-2xl bg-pastel-blue font-display text-lg font-semibold text-foreground sm:size-24"
            }
            aria-hidden
          >
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {teacher.fullName}
          </h2>
          {teacher.subjects.length ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {teacher.subjects.join(" · ")}
            </p>
          ) : null}
          {teacher.bio ? (
            <p
              className={
                home
                  ? "mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/80"
                  : "mt-3 text-sm leading-relaxed text-foreground/90"
              }
            >
              {teacher.bio}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
