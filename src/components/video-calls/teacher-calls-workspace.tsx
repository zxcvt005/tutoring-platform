"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { apiVideoCallCreate, apiVideoCallList } from "@/lib/video/api";
import { deviceErrorMessage } from "@/lib/video/device-error";
import type { VideoCallMode, VideoCallSummary } from "@/lib/video/types";

export function TeacherCallsWorkspace() {
  const router = useRouter();
  const [calls, setCalls] = useState<VideoCallSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<VideoCallMode | null>(null);

  async function reload() {
    const data = await apiVideoCallList();
    setCalls(data.calls);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiVideoCallList();
        if (!cancelled) setCalls(data.calls);
      } catch (err) {
        if (!cancelled) setError(deviceErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(mode: VideoCallMode) {
    setBusy(mode);
    setError(null);
    try {
      const data = await apiVideoCallCreate(mode);
      router.push(`/kafedra/calls/${data.call.id}`);
    } catch (err) {
      setError(deviceErrorMessage(err));
      setBusy(null);
      void reload();
    }
  }

  return (
    <div>
      <PageHeader
        title="Звонки"
        description="Параллельные комнаты или общая конференция. Не привязано к расписанию."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void create("parallel")}
            >
              {busy === "parallel" ? "Создание…" : "Параллельный звонок"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void create("group")}
            >
              {busy === "group" ? "Создание…" : "Групповой звонок"}
            </Button>
          </div>
        }
      />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {calls === null ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : calls.length === 0 ? (
        <EmptyState
          title="Пока нет звонков"
          description="Создайте параллельный звонок, чтобы работать с учениками по очереди, или групповой — если нужна общая комната."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {calls.map((call) => (
            <li key={call.id}>
              <Link
                href={`/kafedra/calls/${call.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-medium">
                    {call.mode === "parallel" ? "Параллельный" : "Групповой"}
                    {call.status === "ended" ? " · завершён" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(call.createdAt)}
                    {call.mode === "parallel"
                      ? ` · комнат: ${call.participantCount}`
                      : ` · участников: ${call.participantCount}`}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">Открыть</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
