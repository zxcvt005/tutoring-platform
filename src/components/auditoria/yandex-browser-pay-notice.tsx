"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { STUDENT_LOGIN_URL } from "@/lib/browser/yandex-browser";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function YandexBrowserPayNotice({ className }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLoginUrl() {
    try {
      await navigator.clipboard.writeText(STUDENT_LOGIN_URL);
      setCopied(true);
      toast.message("Адрес скопирован");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать адрес");
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-black/10 bg-auditoria-surface p-4 sm:p-5",
        className
      )}
      data-testid="yandex-browser-pay-notice"
    >
      <h3 className="font-display text-lg font-semibold tracking-tight">
        Оплата доступна через Яндекс Браузер
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/85">
        Извините за неудобство! Сейчас платёжная страница Точка Банка может
        некорректно работать в других браузерах.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/85">
        Чтобы оплатить занятия, пожалуйста, откройте личный кабинет «Неодин»
        через Яндекс Браузер и войдите в свой аккаунт.
      </p>

      <div className="mt-4 min-w-0 rounded-xl border border-black/10 bg-white/70 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">Адрес входа</p>
        <div className="mt-1.5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all text-sm font-medium tracking-tight text-foreground">
            {STUDENT_LOGIN_URL}
          </code>
          <button
            type="button"
            onClick={() => void copyLoginUrl()}
            data-testid="copy-login-url"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-[#e7dff6]/90 px-3.5 text-sm font-medium"
          >
            {copied ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Copy className="size-3.5 shrink-0" aria-hidden />
            )}
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Откройте Яндекс Браузер, вставьте скопированный адрес в адресную строку
        и войдите в личный кабинет. После этого вы сможете перейти к оплате.
      </p>
      <p className="mt-3 text-sm font-medium text-foreground/90">
        Спасибо за понимание!
      </p>
    </div>
  );
}
