"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { PasswordField } from "@/components/auth/password-field";
import { RegisterShell } from "@/components/auth/register-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiAcceptInvitation,
  apiGetPublicInvitation,
  type PublicInvitationPayload,
} from "@/lib/store/api-client";
import { cabinetHomeForRole } from "@/lib/auth/roles";

const STATUS_MESSAGE: Record<
  Exclude<PublicInvitationPayload["status"], "pending">,
  string
> = {
  used: "Эта ссылка уже использована. Войдите в существующий аккаунт.",
  revoked: "Приглашение отозвано директором. Запросите новую ссылку.",
  expired: "Срок действия приглашения истёк. Запросите новую ссылку.",
};

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();

  const [view, setView] = useState<PublicInvitationPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void apiGetPublicInvitation(token)
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Приглашение не найдено"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError("Пароль и подтверждение не совпадают");
      return;
    }
    setLoading(true);
    try {
      const result = await apiAcceptInvitation(token, {
        email,
        password,
        passwordConfirm,
      });
      router.replace(cabinetHomeForRole(result.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <RegisterShell
        title="Ссылка недоступна"
        description={loadError}
      >
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Войти
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            На главную
          </Link>
        </p>
      </RegisterShell>
    );
  }

  if (!view) {
    return (
      <RegisterShell title="Приглашение" description="Загрузка…">
        <p className="text-sm text-muted-foreground">Проверяем ссылку…</p>
      </RegisterShell>
    );
  }

  if (view.status !== "pending") {
    return (
      <RegisterShell
        title={view.organizationName}
        description={STATUS_MESSAGE[view.status]}
      >
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Войти
          </Link>
          {view.kind === "student" ? (
            <>
              {" · "}
              <Link
                href="/register/student"
                className="underline-offset-4 hover:underline"
              >
                Публичная регистрация ученика
              </Link>
            </>
          ) : null}
        </p>
      </RegisterShell>
    );
  }

  return (
    <RegisterShell
      title={view.organizationName}
      description={`Вас пригласили как ${
        view.kind === "teacher" ? "преподавателя" : "ученика"
      }${view.inviteeName ? ` (${view.inviteeName})` : ""}. После создания аккаунта откроется кабинет «${view.cabinetLabel}».`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email для входа</Label>
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
        <PasswordField
          id="password"
          label="Пароль (≥10, буквы и цифры)"
          value={password}
          onChange={setPassword}
        />
        <PasswordField
          id="passwordConfirm"
          label="Повтор пароля"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
        />
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
          {loading ? "Создание…" : "Создать аккаунт"}
        </Button>
      </form>
    </RegisterShell>
  );
}
