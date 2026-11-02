"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { apiVideoCallCandidates, apiVideoCallInvite } from "@/lib/video/api";
import { deviceErrorMessage } from "@/lib/video/device-error";
import type { VideoInviteCandidate } from "@/lib/video/types";

export function InviteStudentsDialog({
  callId,
  open,
  onOpenChange,
  onInvited,
}: {
  callId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<VideoInviteCandidate[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await apiVideoCallCandidates(callId, query);
          if (!cancelled) {
            setRows(data.candidates);
            setError(null);
          }
        } catch (err) {
          if (!cancelled) setError(deviceErrorMessage(err));
        }
      })();
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [callId, open, query]);

  async function invite(studentId: string) {
    setBusyId(studentId);
    setError(null);
    try {
      await apiVideoCallInvite(callId, [studentId]);
      const data = await apiVideoCallCandidates(callId, query);
      setRows(data.candidates);
      onInvited();
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Пригласить ученика</DialogTitle>
          <DialogDescription>
            Любой активный ученик школы. Ближайшее занятие — выше в списке.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="px-1 py-3 text-sm text-muted-foreground">
              Нет доступных учеников
            </li>
          ) : (
            rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.nextLessonAt
                      ? `Ближайшее занятие ${formatDateTime(row.nextLessonAt)}`
                      : "Нет ближайшего занятия"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void invite(row.id)}
                >
                  {busyId === row.id ? "…" : "Пригласить"}
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
