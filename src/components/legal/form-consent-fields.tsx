"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  LEGAL_DOCUMENTS,
  PERSONAL_DATA_CONSENT_LABEL_AFTER,
  PERSONAL_DATA_CONSENT_LABEL_BEFORE,
  PERSONAL_DATA_CONSENT_LINK_TEXT,
  PUBLIC_OFFER_CONSENT_LABEL_BEFORE,
  PUBLIC_OFFER_CONSENT_LINK_TEXT,
} from "@/lib/legal/documents";
import { cn } from "@/lib/utils";

export type FormConsentState = {
  personalData: boolean;
  marketing: boolean;
  publicOffer: boolean;
};

export const emptyFormConsentState = (): FormConsentState => ({
  personalData: false,
  marketing: false,
  publicOffer: false,
});

function ConsentRow({
  id,
  checked,
  onChange,
  required,
  children,
  error,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  required?: boolean;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-foreground/90"
      >
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 rounded border-border"
          checked={checked}
          required={required}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p className="pl-6 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormConsentFields({
  value,
  onChange,
  showMarketing = true,
  showPublicOffer = false,
  publicOfferAvailable = false,
  errors,
  className,
  idPrefix = "legal",
}: {
  value: FormConsentState;
  onChange: (next: FormConsentState) => void;
  showMarketing?: boolean;
  showPublicOffer?: boolean;
  /** Пока оферты нет — чекбокс не показываем / не требуем. */
  publicOfferAvailable?: boolean;
  errors?: Partial<Record<keyof FormConsentState, string>>;
  className?: string;
  idPrefix?: string;
}) {
  const privacy = LEGAL_DOCUMENTS["privacy-policy"];
  const marketing = LEGAL_DOCUMENTS["marketing-consent"];
  const offer = LEGAL_DOCUMENTS["public-offer"];

  return (
    <div className={cn("space-y-3 rounded-xl border border-border/50 bg-muted/15 px-3 py-3", className)}>
      <ConsentRow
        id={`${idPrefix}-pd`}
        checked={value.personalData}
        required
        error={errors?.personalData}
        onChange={(personalData) => onChange({ ...value, personalData })}
      >
        {PERSONAL_DATA_CONSENT_LABEL_BEFORE}
        <Link
          href={privacy.path}
          target="_blank"
          className="font-medium underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {PERSONAL_DATA_CONSENT_LINK_TEXT}
        </Link>
        {PERSONAL_DATA_CONSENT_LABEL_AFTER}
      </ConsentRow>

      {showPublicOffer && publicOfferAvailable ? (
        <ConsentRow
          id={`${idPrefix}-offer`}
          checked={value.publicOffer}
          required
          error={errors?.publicOffer}
          onChange={(publicOffer) => onChange({ ...value, publicOffer })}
        >
          {PUBLIC_OFFER_CONSENT_LABEL_BEFORE}
          <Link
            href={offer.path}
            target="_blank"
            className="font-medium underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {PUBLIC_OFFER_CONSENT_LINK_TEXT}
          </Link>
          .
        </ConsentRow>
      ) : null}

      {showMarketing ? (
        <ConsentRow
          id={`${idPrefix}-mkt`}
          checked={value.marketing}
          error={errors?.marketing}
          onChange={(marketingChecked) =>
            onChange({ ...value, marketing: marketingChecked })
          }
        >
          Согласен (-на) на{" "}
          <Link
            href={marketing.path}
            target="_blank"
            className="font-medium underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            рекламную рассылку
          </Link>{" "}
          (необязательно). Отказ не мешает отправить форму.
        </ConsentRow>
      ) : null}
    </div>
  );
}

export function validateRequiredFormConsents(
  value: FormConsentState,
  opts?: { requireOffer?: boolean }
): Partial<Record<keyof FormConsentState, string>> {
  const errors: Partial<Record<keyof FormConsentState, string>> = {};
  if (!value.personalData) {
    errors.personalData = "Необходимо согласие на обработку персональных данных";
  }
  if (opts?.requireOffer && !value.publicOffer) {
    errors.publicOffer = "Необходимо согласие с условиями оферты";
  }
  return errors;
}
