"use client";

import { initialsFromName } from "@/lib/format";
import type { Teacher } from "@/lib/types";

export function AuditoriaTeacherCard({ teacher }: { teacher: Teacher | null }) {
  if (!teacher) {
    return (
      <section className="rounded-2xl border border-border/70 bg-muted/20 p-5">
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Преподаватель
        </p>
        <p className="mt-2 font-display text-xl font-semibold tracking-tight">
          Пока не назначен
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Школа назначит преподавателя — после этого здесь появится его профиль.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 p-5">
      <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Преподаватель
      </p>
      <div className="mt-3 flex gap-4">
        {teacher.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={teacher.photoUrl}
            alt=""
            className="size-20 shrink-0 rounded-2xl object-cover sm:size-24"
          />
        ) : (
          <div
            className="flex size-20 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white sm:size-24"
            style={{ background: "#3166F0" }}
            aria-hidden
          >
            {teacher.avatarInitials || initialsFromName(teacher.fullName)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {teacher.fullName}
          </h2>
          {teacher.subjects.length ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {teacher.subjects.join(" · ")}
            </p>
          ) : null}
          {teacher.bio ? (
            <p className="mt-3 text-sm leading-relaxed text-foreground/90">
              {teacher.bio}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
