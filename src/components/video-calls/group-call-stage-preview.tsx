"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MicOff, VideoOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  groupStudentColumns,
  groupStudentPages,
  resolveGroupViewport,
  sliceStudentPage,
  type GroupGridViewport,
} from "@/lib/video/group-grid-layout";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0369a1",
  "#4d7c0f",
  "#c2410c",
  "#6d28d9",
  "#0e7490",
];

function MockTile({
  label,
  color,
  featured,
  micMuted,
  cameraOff,
}: {
  label: string;
  color: string;
  featured?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-white/10",
        featured ? "aspect-[16/10]" : "aspect-[4/3] min-h-[7.5rem] sm:min-h-[9rem]"
      )}
      style={{ background: cameraOff ? "#18181b" : color }}
    >
      {!cameraOff ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-16 rounded-full bg-white/25 sm:size-20" />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
          <VideoOff className="size-7" />
          <span className="text-xs">Камера выключена</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
        <span className="rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
          {label}
        </span>
        {micMuted ? (
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-black/55 text-red-300">
            <MicOff className="size-3.5" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function GroupCallStagePreview({
  studentCount,
  perspective = "teacher",
}: {
  studentCount: number;
  perspective?: "teacher" | "student";
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<GroupGridViewport>("desktop");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const apply = () => setViewport(resolveGroupViewport(el.clientWidth));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const students = useMemo(
    () =>
      Array.from({ length: studentCount }, (_, i) => ({
        id: `s${i + 1}`,
        label: i === studentCount - 1 && perspective === "student" ? "Вы" : `Ученик ${i + 1}`,
        color: PALETTE[i % PALETTE.length]!,
        micMuted: i % 4 === 1,
        cameraOff: i % 5 === 3,
      })),
    [perspective, studentCount]
  );

  const pageCount = groupStudentPages(students.length, viewport);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const visible = sliceStudentPage(students, safePage, viewport);
  const cols = groupStudentColumns(visible.length, viewport);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-0 w-full flex-col gap-3 bg-zinc-900 p-3 text-zinc-100 sm:p-4"
      data-testid="group-grid-preview"
      data-students={studentCount}
    >
      <div className="mx-auto w-full max-w-3xl shrink-0">
        <MockTile
          label={perspective === "teacher" ? "Вы · Преподаватель" : "Преподаватель"}
          color="#334155"
          featured
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-400">
            Участники · {students.length}
            {pageCount > 1 ? ` · стр. ${safePage + 1}/${pageCount}` : ""}
          </p>
          {pageCount > 1 ? (
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={() =>
                  setPage((safePage - 1 + pageCount) % pageCount)
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={() => setPage((safePage + 1) % pageCount)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="grid gap-2.5 sm:gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((s) => (
              <MockTile
                key={s.id}
                label={s.label}
                color={s.color}
                micMuted={s.micMuted}
                cameraOff={s.cameraOff}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
