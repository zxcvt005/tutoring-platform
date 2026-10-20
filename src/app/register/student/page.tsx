"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { PasswordField } from "@/components/auth/password-field";
import { RegisterShell } from "@/components/auth/register-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRegisterStudent } from "@/lib/store/api-client";

export default function RegisterStudentPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [contacts, setContacts] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError("Пароль и подтверждение не совпадают");
      return;
    }
    setLoading(true);
    try {
      await apiRegisterStudent({
        fullName,
        email,
        password,
        passwordConfirm,
        contacts: contacts.trim() || undefined,
      });
      router.replace("/auditoria");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <RegisterShell
      title="Регистрация ученика"
      description="Создайте учётную запись для кабинета «Аудитория». Преподавателя назначит школа после регистрации."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">ФИО</Label>
          <Input
            id="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contacts">Контакт для связи</Label>
          <Input
            id="contacts"
            value={contacts}
            onChange={(e) => setContacts(e.target.value)}
            placeholder="Телефон или мессенджер"
            className="h-10 rounded-xl"
          />
        </div>
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
          {loading ? "Создание…" : "Зарегистрироваться"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Вы преподаватель?{" "}
          <Link
            href="/register/teacher"
            className="underline-offset-4 hover:underline"
          >
            Регистрация преподавателя
          </Link>
        </p>
      </form>
    </RegisterShell>
  );
}
