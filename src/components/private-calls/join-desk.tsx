"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { StudentCallSession } from "@/components/video-calls/student-call-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiPrivateGuest,
  apiPrivateGuestTokens,
  apiPrivateJoin,
  apiPrivateJoinInfo,
  apiPrivateLeave,
  apiPrivatePulse,
} from "@/lib/private-calls/api";
import { deviceErrorMessage } from "@/lib/video/device-error";
import type { StudentCallTransport } from "@/lib/video/call-transport";
import type { VideoCallStudentView } from "@/lib/video/types";

const guestTransport: StudentCallTransport = {
  async get() {
    const data = await apiPrivateGuest();
    if (!data.call) throw new Error("Нет доступа к этой комнате");
    return { call: data.call };
  },
  async tokens() {
    return apiPrivateGuestTokens();
  },
};

export function PrivateJoinDesk({ code }: { code: string }) {
  const [phase, setPhase] = useState<"loading" | "form" | "call">("loading");
  const [call, setCall] = useState<VideoCallStudentView | null>(null);
  const [available, setAvailable] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [guest, info] = await Promise.all([
          apiPrivateGuest(),
          apiPrivateJoinInfo(code),
        ]);
        if (cancelled) return;
        setAvailable(info.available);
        setAccepting(info.accepting);
        if (guest.joined && guest.call) {
          setCall(guest.call);
          setPhase("call");
          return;
        }
        setPhase("form");
      } catch (err) {
        if (cancelled) return;
        setError(deviceErrorMessage(err));
        setPhase("form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const notice = useMemo(() => {
    if (!available) return "Ссылка недействительна. Попросите новую у преподавателя.";
    if (!accepting) return "Преподаватель сейчас не принимает новые подключения.";
    return "Введите имя. Камера и микрофон понадобятся, чтобы войти в свою комнату.";
  }, [accepting, available]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!available || !accepting) return;
    setBusy(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      for (const track of stream.getTracks()) track.stop();
      const data = await apiPrivateJoin(code, name.trim());
      if (data.call.role !== "student") {
        throw new Error("Нет доступа к этой комнате");
      }
      setCall(data.call);
      setPhase("call");
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">Загрузка…</main>
    );
  }

  if (phase === "call" && call) {
    return (
      <StudentCallSession
        callId={call.id}
        transport={guestTransport}
        cabinetHref={`/join/${code}`}
        exitHref={`/join/${code}`}
        overlayLayout="full"
        leaveTitle="Выйти из звонка?"
        leaveDescription="Комната сразу закроется. Чтобы подключиться снова, откройте ссылку ещё раз и введите имя."
        pulse
        onPulse={apiPrivatePulse}
        onLeave={async () => {
          await apiPrivateLeave();
          setCall(null);
          setPhase("form");
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Неодин
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Подключение
        </h1>
        <p className="text-sm text-muted-foreground">{notice}</p>
      </div>
      <form onSubmit={(event) => void connect(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="guest-name">Имя</Label>
          <Input
            id="guest-name"
            required
            maxLength={40}
            value={name}
            disabled={!available || !accepting || busy}
            onChange={(event) => setName(event.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          className="h-10 w-full rounded-xl"
          disabled={!available || !accepting || busy}
        >
          {busy ? "Подключение…" : "Подключиться"}
        </Button>
      </form>
    </main>
  );
}
