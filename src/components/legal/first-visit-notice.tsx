"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  needsFirstVisitNotice,
  readLegalClientPrefs,
  writeLegalClientPrefs,
} from "@/lib/legal/client-prefs";
import { LEGAL_DOCUMENT_LIST, LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { recordClientConsents } from "@/lib/legal/record-client-consents";

export function FirstVisitNotice() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOpen(needsFirstVisitNotice(readLegalClientPrefs()));
    setReady(true);
  }, []);

  if (!ready || !open) return null;

  function continueBrowsing(ackPrivacy: boolean) {
    const prev = readLegalClientPrefs();
    const now = new Date().toISOString();
    writeLegalClientPrefs({
      ...prev,
      firstVisitDismissedAt: now,
      privacyAckVersion: ackPrivacy
        ? LEGAL_DOCUMENTS["privacy-policy"].version
        : prev.privacyAckVersion,
      privacyAckAt: ackPrivacy ? now : prev.privacyAckAt,
    });
    if (ackPrivacy) {
      void recordClientConsents({
        source: "first_visit",
        privacyAck: true,
      });
    }
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/25 p-3 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-visit-legal-title"
        className="w-full max-w-lg rounded-3xl border border-border/70 bg-[color:var(--panel-soft,#fffdf9)] p-5 shadow-[0_20px_60px_-24px_rgba(70,50,80,0.45)] sm:p-6"
      >
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Неодин
        </p>
        <h2
          id="first-visit-legal-title"
          className="mt-1 font-display text-2xl font-semibold tracking-tight"
        >
          Правовая информация
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">
          Перед использованием сервиса вы можете ознакомиться с документами.
          Ознакомление с политикой не заменяет согласие в формах. Рекламная
          рассылка всегда добровольна и не нужна для просмотра сайта.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {LEGAL_DOCUMENT_LIST.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={doc.path}
                className="font-medium underline-offset-2 hover:underline"
                target="_blank"
              >
                {doc.title}
                {!doc.available ? " (ожидает исходный документ)" : ""}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => continueBrowsing(false)}
          >
            Продолжить просмотр
          </Button>
          <Button
            type="button"
            className="h-10 rounded-xl"
            onClick={() => continueBrowsing(true)}
          >
            Ознакомился с политикой
          </Button>
        </div>
      </div>
    </div>
  );
}
