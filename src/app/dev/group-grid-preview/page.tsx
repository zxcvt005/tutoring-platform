"use client";

import { useMemo, useState } from "react";

import { GroupCallStagePreview } from "@/components/video-calls/group-call-stage-preview";
import { Button } from "@/components/ui/button";

const COUNTS = [2, 3, 4, 6, 8, 10] as const;

export default function GroupGridPreviewPage() {
  const [count, setCount] = useState<(typeof COUNTS)[number]>(4);
  const [perspective, setPerspective] = useState<"teacher" | "student">(
    "teacher"
  );
  const title = useMemo(
    () => `Групповая сетка · ${count} учеников · ${perspective}`,
    [count, perspective]
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h1 className="mr-2 text-sm font-medium">{title}</h1>
        {COUNTS.map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant={count === n ? "default" : "outline"}
            onClick={() => setCount(n)}
          >
            {n}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={perspective === "teacher" ? "secondary" : "outline"}
          onClick={() => setPerspective("teacher")}
        >
          Преподаватель
        </Button>
        <Button
          type="button"
          size="sm"
          variant={perspective === "student" ? "secondary" : "outline"}
          onClick={() => setPerspective("student")}
        >
          Ученик
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <GroupCallStagePreview studentCount={count} perspective={perspective} />
      </div>
    </div>
  );
}
