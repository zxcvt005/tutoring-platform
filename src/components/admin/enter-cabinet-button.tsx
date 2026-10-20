"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiStartImpersonation } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

type Props = {
  userId?: string | null;
  teacherId?: string;
  studentId?: string;
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default" | "ghost";
};

export function EnterCabinetButton({
  userId,
  teacherId,
  studentId,
  className,
  size = "sm",
  variant = "outline",
}: Props) {
  const { auth } = useDemoStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (auth?.role !== "director" || auth.impersonation?.active) return null;

  const canEnter = Boolean(userId);

  async function enter() {
    if (!userId) {
      toast.error("У пользователя нет учётной записи для входа");
      return;
    }
    setLoading(true);
    try {
      const result = await apiStartImpersonation({
        userId,
        teacherId,
        studentId,
      });
      router.replace(result.redirectTo);
      toast.success("Открыт кабинет пользователя");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось войти в кабинет");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("rounded-lg", className)}
      disabled={loading || !canEnter}
      onClick={() => void enter()}
      title={!canEnter ? "Нет связанной учётной записи" : undefined}
    >
      {loading ? "Вход…" : "Войти в кабинет"}
    </Button>
  );
}
