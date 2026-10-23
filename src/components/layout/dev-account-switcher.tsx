"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiDemoLogin,
  type BootstrapAuth,
  type DemoAccountOption,
} from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

export function DevAccountSwitcher({ auth }: { auth: BootstrapAuth | null }) {
  const router = useRouter();
  const { reload, setCurrentTeacherId, setCurrentStudentId, logout, features } =
    useDemoStore();
  const [busy, setBusy] = useState(false);

  const accounts: DemoAccountOption[] = features?.demoAccounts ?? [];
  const directors = accounts.filter((a) => a.group === "director");
  const teachers = accounts.filter((a) => a.group === "teachers");
  const students = accounts.filter((a) => a.group === "students");

  async function switchTo(account: DemoAccountOption) {
    setBusy(true);
    try {
      await apiDemoLogin({
        role: account.role,
        teacherId: account.teacherId,
        studentId: account.studentId,
        email: account.email,
      });
      if (account.teacherId) setCurrentTeacherId(account.teacherId);
      if (account.studentId) setCurrentStudentId(account.studentId);
      await reload();
      router.push(account.href);
      toast.success(`Вход: ${account.fullName}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось переключить аккаунт"
      );
    } finally {
      setBusy(false);
    }
  }

  const currentLabel = auth
    ? `${auth.fullName} (${
        auth.role === "director"
          ? "директор"
          : auth.role === "teacher"
            ? "преподаватель"
            : "ученик"
      })`
    : "не выбран";

  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/80 p-2 text-[11px] text-muted-foreground">
        Нет тестовых аккаунтов. Запустите seed школы (
        <code className="text-[10px]">npm run start:local</code>).
      </p>
    );
  }

  return (
    <div
      className="space-y-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-50/50 p-2.5 dark:bg-amber-950/20"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="px-0.5 text-[0.65rem] font-semibold tracking-[0.12em] text-amber-800 uppercase dark:text-amber-200">
        Dev · тестовые аккаунты
      </p>
      <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
        Сейчас: {currentLabel}
      </p>

      {directors.map((a) => (
        <Button
          key={a.id}
          type="button"
          size="sm"
          variant="outline"
          className="w-full justify-start rounded-lg text-left"
          disabled={busy}
          onClick={() => void switchTo(a)}
        >
          Директор — {a.fullName}
        </Button>
      ))}

      <div className="space-y-1">
        <p className="px-0.5 text-[11px] font-medium text-muted-foreground">
          Преподаватели
        </p>
        {teachers.map((a) => (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto w-full justify-start rounded-lg px-2 py-1.5 text-left text-xs whitespace-normal"
            disabled={busy}
            onClick={() => void switchTo(a)}
          >
            {a.fullName}
            {a.note ? (
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {a.note}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <p className="px-0.5 text-[11px] font-medium text-muted-foreground">
          Ученики ({students.length})
        </p>
        <Select
          disabled={busy || students.length === 0}
          value={auth?.studentId ?? null}
          onValueChange={(id) => {
            const a = students.find((s) => s.studentId === id);
            if (a) void switchTo(a);
          }}
        >
          <SelectTrigger className="w-full rounded-lg">
            <SelectValue placeholder="Выбрать ученика">
              {() => {
                const cur = students.find(
                  (s) => s.studentId === auth?.studentId
                );
                return cur?.fullName ?? "Выбрать ученика";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {students.map((s) => (
              <SelectItem key={s.id} value={s.studentId!}>
                {s.fullName}
                {s.note ? ` · ${s.note}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="w-full rounded-lg text-xs"
        disabled={busy}
        onClick={() => void logout()}
      >
        Выйти из кабинета
      </Button>
    </div>
  );
}
