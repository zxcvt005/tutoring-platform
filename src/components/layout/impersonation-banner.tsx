"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiStopImpersonation } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

export function ImpersonationBanner() {
  const { auth } = useDemoStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!auth?.impersonation?.active) return null;

  async function stop() {
    setLoading(true);
    try {
      const result = await apiStopImpersonation();
      router.replace(result.redirectTo || "/direkciya");
      toast.success("Вы вернулись в Дирекцию");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось завершить просмотр");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-3">
        <p>
          Вы просматриваете кабинет пользователя от имени администратора
          {auth.fullName ? (
            <span className="text-amber-900/80 dark:text-amber-100/80">
              {" "}
              · {auth.fullName}
            </span>
          ) : null}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-lg border-amber-600/40 bg-background/80"
          disabled={loading}
          onClick={() => void stop()}
        >
          {loading ? "Возврат…" : "Вернуться в Дирекцию"}
        </Button>
      </div>
    </div>
  );
}
