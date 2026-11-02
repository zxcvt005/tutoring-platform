"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { TeacherCallSession } from "@/components/video-calls/teacher-call-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiPrivateAccepting,
  apiPrivateActivate,
  apiPrivateClose,
  apiPrivateEnd,
  apiPrivateHold,
  apiPrivateHostGet,
  apiPrivateHostTokens,
  apiPrivateLogin,
  apiPrivateLogout,
  apiPrivateStart,
  type PrivateHostSnapshot,
} from "@/lib/private-calls/api";
import { HttpStatusError } from "@/lib/store/api-client";
import type { TeacherCallTransport } from "@/lib/video/call-transport";
import { deviceErrorMessage } from "@/lib/video/device-error";

const transport: TeacherCallTransport = {
  async get() {
    const data = await apiPrivateHostGet();
    if (!data.session) {
      throw new HttpStatusError(404, "Сессия завершена");
    }
    return { call: data.session.call };
  },
  async tokens() {
    return apiPrivateHostTokens();
  },
  async activate(_id, participantId) {
    return apiPrivateActivate(participantId);
  },
  async hold() {
    return apiPrivateHold();
  },
  async closeParticipant(_id, participantId) {
    return apiPrivateClose(participantId);
  },
  async end() {
    return apiPrivateEnd();
  },
};

export function PrivateTeacherDesk() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [session, setSession] = useState<PrivateHostSnapshot | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await apiPrivateHostGet();
    setAuthed(true);
    setSession(data.session);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled && err instanceof HttpStatusError && err.status === 401) {
          setAuthed(false);
          setSession(null);
        } else if (!cancelled) {
          setError(deviceErrorMessage(err));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPrivateLogin(password);
      setPassword("");
      await load();
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await apiPrivateLogout();
      setAuthed(false);
      setSession(null);
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiPrivateStart();
      setSession(data.session);
      setCopied(false);
    } catch (err) {
      setError(deviceErrorMessage(err));
    } finally {
      setBusy(false);
      setRestartOpen(false);
    }
  }

  async function toggleAccepting() {
    if (!session) return;
    setError(null);
    try {
      const data = await apiPrivateAccepting(!session.accepting);
      setSession(data.session);
    } catch (err) {
      setError(deviceErrorMessage(err));
    }
  }

  async function copyLink() {
    if (!session) return;
    const value = `${window.location.origin}/join/${session.code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }

  if (!ready) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">Загрузка…</main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Неодин
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Приём звонков
          </h1>
          <p className="text-sm text-muted-foreground">
            Отдельный вход. Кабинет платформы для этой страницы не нужен.
          </p>
        </div>
        <form onSubmit={(event) => void login(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="private-password">Пароль</Label>
            <Input
              id="private-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-10 w-full rounded-xl" disabled={busy}>
            {busy ? "Вход…" : "Войти"}
          </Button>
        </form>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Приём звонков
          </h1>
          <p className="text-sm text-muted-foreground">
            Запустите сессию и отправьте одну ссылку. Каждый, кто откроет её,
            попадёт в свою комнату.
          </p>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void start()}>
            {busy ? "Запуск…" : "Начать приём"}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </main>
    );
  }

  const link = `${window.location.origin}/join/${session.code}`;
  const header = (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-3 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">
          {session.accepting
            ? "Новые подключения открыты"
            : "Новые подключения закрыты"}
        </p>
        <Input readOnly value={link} aria-label="Ссылка для учеников" className="h-8" />
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
          {copied ? "Скопировано" : "Копировать ссылку"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void toggleAccepting()}>
          {session.accepting ? "Закрыть приём" : "Открыть приём"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setRestartOpen(true)}>
          Новая сессия
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
          Выйти
        </Button>
      </div>
      {error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      <TeacherCallSession
        key={session.id}
        callId={session.id}
        transport={transport}
        cabinetHref="/private-calls"
        allowInvite={false}
        overlayLayout="full"
        header={header}
        emptyRoomsLabel="Пока никто не подключился"
        onEnded={() => setSession(null)}
      />
      <ConfirmDialog
        open={restartOpen}
        title="Начать новую сессию?"
        description="Текущие комнаты закроются, старая ссылка перестанет работать."
        confirmLabel="Новая сессия"
        busyLabel="Запуск…"
        busy={busy}
        onOpenChange={setRestartOpen}
        onConfirm={() => void start()}
      />
    </>
  );
}
