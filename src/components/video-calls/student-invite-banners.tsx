"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiVideoCallList } from "@/lib/video/api";
import type { VideoCallSummary } from "@/lib/video/types";

function isJoinable(call: VideoCallSummary) {
  return call.status === "active" && call.myStatus !== "closed";
}

export function StudentInviteBanners() {
  const [invites, setInvites] = useState<VideoCallSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiVideoCallList();
        if (!cancelled) setInvites(data.calls.filter(isJoinable));
      } catch {
        if (!cancelled) setInvites([]);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (invites.length === 0) return null;

  return (
    <div className="space-y-2">
      {invites.map((call) => (
        <section
          key={call.id}
          className="rounded-2xl border border-primary/40 bg-auditoria-surface px-4 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Вас пригласили на видеозвонок</p>
              <p className="truncate text-sm text-muted-foreground">
                {call.teacherName} ожидает вас. Подключитесь к звонку.
              </p>
            </div>
            <Link
              href={`/auditoria/calls/${call.id}`}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Подключиться
            </Link>
          </div>
        </section>
      ))}
    </div>
  );
}
