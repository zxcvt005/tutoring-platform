"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { PasswordField } from "@/components/auth/password-field";
import { RegisterShell } from "@/components/auth/register-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRegisterTeacher } from "@/lib/store/api-client";

export default function RegisterTeacherPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [subjects, setSubjects] = useState("");
  const [specializations, setSpecializations] = useState("");
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
      await apiRegisterTeacher({
        fullName,
        email,
        password,
        passwordConfirm,
        phone: phone.trim() || undefined,
        subjects: subjects
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        specializations: specializations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      router.replace("/kafedra");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <RegisterShell
      title="Регистрация преподавателя"
      description="Создайте учётную запись для кабинета «Кафедра». После регистрации можно войти через страницу входа."
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
          <Label htmlFor="phone">Телефон</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subjects">Предметы</Label>
          <Input
            id="subjects"
            value={subjects}
            onChange={(e) => setSubjects(e.target.value)}
            placeholder="через запятую"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="specializations">Специализации</Label>
          <Input
            id="specializations"
            value={specializations}
            onChange={(e) => setSpecializations(e.target.value)}
            placeholder="через запятую"
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
          autoComplete="new-password"
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
          Нужен кабинет ученика?{" "}
          <Link
            href="/register/student"
            className="underline-offset-4 hover:underline"
          >
            Регистрация ученика
          </Link>
        </p>
      </form>
    </RegisterShell>
  );
}
