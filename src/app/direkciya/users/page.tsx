"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import {
  apiAdminCreateUser,
  apiAdminPatchUser,
  apiAdminUsers,
} from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

type Row = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
};

export default function DirekciyaUsersPage() {
  const { auth } = useDemoStore();
  const [users, setUsers] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"director" | "teacher" | "student">(
    "teacher"
  );

  const reload = useCallback(async () => {
    try {
      const data = await apiAdminUsers();
      setUsers(data.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Нет доступа");
    }
  }, []);

  useEffect(() => {
    if (auth?.role !== "director") return;
    let cancelled = false;
    void apiAdminUsers()
      .then((data) => {
        if (!cancelled) setUsers(data.users);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Нет доступа");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.role]);

  if (auth && auth.role !== "director") {
    return (
      <p className="text-sm text-muted-foreground">
        Управление пользователями доступно только дирекции.
      </p>
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiAdminCreateUser({ email, password, fullName, role });
      toast.success("Пользователь создан");
      setEmail("");
      setPassword("");
      setFullName("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function toggleStatus(u: Row) {
    const next = u.status === "active" ? "disabled" : "active";
    try {
      await apiAdminPatchUser(u.id, { status: next });
      toast.success(next === "active" ? "Включён" : "Отключён");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Пользователи"
        description="Создание аккаунтов и управление доступом. Публичная регистрация преподавателей и учеников тоже доступна."
      />

      <form
        onSubmit={onCreate}
        className="grid max-w-xl gap-3 rounded-2xl border border-border/80 p-4"
      >
        <p className="text-sm font-medium">Новый аккаунт</p>
        <div className="space-y-1.5">
          <Label>ФИО</Label>
          <Input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Пароль (≥10, буквы и цифры)</Label>
          <Input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Роль</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              if (v === "director" || v === "teacher" || v === "student") {
                setRole(v);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="director">Директор</SelectItem>
              <SelectItem value="teacher">Преподаватель</SelectItem>
              <SelectItem value="student">Ученик</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-fit rounded-xl">
          Создать
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Имя</th>
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Роль</th>
              <th className="py-2 pr-3 font-medium">Статус</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/60">
                <td className="py-2 pr-3">{u.fullName}</td>
                <td className="py-2 pr-3">{u.email}</td>
                <td className="py-2 pr-3">{u.role}</td>
                <td className="py-2 pr-3">{u.status}</td>
                <td className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {u.role === "teacher" || u.role === "student" ? (
                      <EnterCabinetButton userId={u.id} />
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => void toggleStatus(u)}
                      disabled={u.id === auth?.userId}
                    >
                      {u.status === "active" ? "Отключить" : "Включить"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
