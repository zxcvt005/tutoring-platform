import Link from "next/link";

import { RegisterShell } from "@/components/auth/register-shell";

export default function RegisterTeacherPage() {
  return (
    <RegisterShell
      title="Регистрация преподавателя закрыта"
      description="Учётную запись преподавателя создаёт директор в разделе «Доступ». Самостоятельно можно зарегистрироваться только как ученик."
    >
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          Войти
        </Link>
        {" · "}
        <Link
          href="/register/student"
          className="underline-offset-4 hover:underline"
        >
          Регистрация ученика
        </Link>
      </p>
    </RegisterShell>
  );
}
