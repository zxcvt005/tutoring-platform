"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiBootstrapAdmin, apiFeatures } from "@/lib/store/api-client";

export default function SetupPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const feats = await apiFeatures();
        setAvailable(feats.needsBootstrap);
        if (!feats.needsBootstrap) router.replace("/login");
      } catch {
        setAvailable(false);
      }
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiBootstrapAdmin({
        token,
        email,
        password,
        fullName,
        organizationName,
      });
      router.replace("/direkciya");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }

  if (available === null) {
    return (
      <p className="p-8 text-sm text-muted-foreground">Проверка…</p>
    );
  }

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 size-80 rounded-full surface-mint opacity-70 blur-2xl"
      />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Первичная настройка
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Первый администратор
          </h1>
          <p className="text-sm text-muted-foreground">
            Публичная регистрация отключена. Нужен секрет{" "}
            <code className="text-xs">BOOTSTRAP_ADMIN_TOKEN</code> из
            переменных окружения сервера. После создания удалите или смените
            токен.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token">Bootstrap-токен</Label>
            <Input
              id="token"
              type="password"
              required
              minLength={24}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org">Название школы</Label>
            <Input
              id="org"
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">ФИО директора</Label>
            <Input
              id="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль (≥10, буквы и цифры)</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={10}
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
            {loading ? "Создание…" : "Создать и войти"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Уже есть аккаунт
          </Link>
        </p>
      </div>
    </main>
  );
}
