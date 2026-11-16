"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { recordClientConsents } from "@/lib/legal/record-client-consents";

/** Отзыв рекламного согласия (добровольный канал поверх форм). */
export function MarketingWithdrawControl() {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function withdraw() {
    setStatus("saving");
    setMessage(null);
    const res = await recordClientConsents({
      source: "settings",
      marketing: false,
    });
    if (!res.ok) {
      setStatus("error");
      setMessage(
        res.message ??
          "Не удалось зафиксировать отзыв. Напишите Оператору по email из Политики."
      );
      return;
    }
    setStatus("done");
    setMessage("Отзыв согласия на рекламную рассылку зафиксирован.");
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-sm leading-relaxed text-foreground/85">
        Согласие на рекламную рассылку можно отозвать в любой момент. Отказ не
        влияет на доступ к сайту и оплаченным услугам.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 h-9 rounded-xl"
        disabled={status === "saving" || status === "done"}
        onClick={() => void withdraw()}
      >
        {status === "saving"
          ? "Сохраняем…"
          : status === "done"
            ? "Отзыв зафиксирован"
            : "Отозвать согласие на рассылку"}
      </Button>
      {message ? (
        <p
          className={`mt-2 text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
