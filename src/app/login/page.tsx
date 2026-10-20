"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiFeatures,
  apiLogin,
  apiMe,
  cabinetHomeForRole,
} from "@/lib/store/api-client";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const feats = await apiFeatures();
        setNeedsBootstrap(feats.needsBootstrap);
        if (feats.needsBootstrap) {
          router.replace("/setup");
          return;
        }
        const me = await apiMe();
        if (me && (me as { role?: string }).role) {
          router.replace(
            cabinetHomeForRole(
              (me as { role: "director" | "teacher" | "student" }).role
            )
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiLogin(email, password);
      const next = search.get("next");
      const home = cabinetHomeForRole(
        result.role as "director" | "teacher" | "student"
      );
      if (
        next &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        ((result.role === "director" && next.startsWith("/direkciya")) ||
          (result.role === "teacher" && next.startsWith("/kafedra")) ||
          (result.role === "student" && next.startsWith("/auditoria")))
      ) {
        router.replace(next);
      } else {
        router.replace(home);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full surface-sky opacity-80 blur-2xl"
      />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Umba
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Вход
          </h1>
          <p className="text-sm text-muted-foreground">
            Войдите по email и паролю. Если аккаунта ещё нет — зарегистрируйтесь.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            disabled={loading}
          >
            {loading ? "Вход…" : "Войти"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            На главную
          </Link>
          {" · "}
          <Link
            href="/register/teacher"
            className="underline-offset-4 hover:underline"
          >
            Преподаватель
          </Link>
          {" · "}
          <Link
            href="/register/student"
            className="underline-offset-4 hover:underline"
          >
            Ученик
          </Link>
          {needsBootstrap ? (
            <>
              {" · "}
              <Link href="/setup" className="underline-offset-4 hover:underline">
                Первичная настройка
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-sm text-muted-foreground">Загрузка…</p>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
