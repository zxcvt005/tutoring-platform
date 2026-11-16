import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { legalConsents } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { validationError } from "@/server/errors";
import {
  LEGAL_DOCUMENTS,
  type ConsentKind,
  type ConsentSource,
  type LegalDocumentSlug,
} from "@/lib/legal/documents";

function newId() {
  return `lcons_${randomBytes(6).toString("hex")}`;
}

function contactHintFrom(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (v.length <= 4) return "***";
  return `${v.slice(0, 2)}…${v.slice(-2)}`;
}

export type RecordConsentInput = {
  kind: ConsentKind;
  status: "granted" | "withdrawn";
  source: ConsentSource;
  documentSlug?: LegalDocumentSlug | null;
  documentVersion?: string | null;
  userId?: string | null;
  siteLeadId?: string | null;
  contactRaw?: string | null;
  organizationId?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function recordLegalConsent(
  db: AppDb,
  input: RecordConsentInput
) {
  if (!input.kind) throw validationError("kind обязателен");
  if (input.status !== "granted" && input.status !== "withdrawn") {
    throw validationError("Некорректный status");
  }

  let documentSlug = input.documentSlug ?? null;
  let documentVersion = input.documentVersion?.trim() || null;

  if (input.kind === "privacy_ack") {
    documentSlug = "privacy-policy";
    documentVersion =
      documentVersion || LEGAL_DOCUMENTS["privacy-policy"].version;
  } else if (input.kind === "personal_data") {
    documentSlug = "personal-data-consent";
    documentVersion =
      documentVersion || LEGAL_DOCUMENTS["personal-data-consent"].version;
  } else if (input.kind === "marketing") {
    documentSlug = "marketing-consent";
    documentVersion =
      documentVersion || LEGAL_DOCUMENTS["marketing-consent"].version;
  } else if (input.kind === "cookie_prefs") {
    documentVersion = documentVersion || "cookie-notice-v1";
  } else if (input.kind === "public_offer") {
    documentSlug = "public-offer";
    documentVersion = documentVersion || "pending";
  }

  if (!documentVersion) {
    throw validationError("documentVersion обязателен");
  }

  const id = newId();
  await db.insert(legalConsents).values({
    id,
    organizationId: input.organizationId ?? null,
    kind: input.kind,
    status: input.status,
    userId: input.userId ?? null,
    siteLeadId: input.siteLeadId ?? null,
    contactHint: contactHintFrom(input.contactRaw),
    source: input.source,
    documentSlug,
    documentVersion,
    payload: input.payload ?? null,
  });

  return { id };
}

export async function recordConsentBundle(
  db: AppDb,
  ctx: AuthContext | null,
  input: {
    source: ConsentSource;
    privacyAck?: boolean;
    personalData?: boolean;
    marketing?: boolean | null;
    publicOffer?: boolean;
    cookie?: {
      analytics: boolean;
      marketing: boolean;
    } | null;
    siteLeadId?: string | null;
    contactRaw?: string | null;
    organizationId?: string | null;
    userId?: string | null;
  }
) {
  const userId = input.userId ?? ctx?.userId ?? null;
  const orgId = input.organizationId ?? ctx?.organizationId ?? null;
  const ids: string[] = [];

  if (input.privacyAck) {
    const r = await recordLegalConsent(db, {
      kind: "privacy_ack",
      status: "granted",
      source: input.source,
      userId,
      organizationId: orgId,
      siteLeadId: input.siteLeadId,
      contactRaw: input.contactRaw,
    });
    ids.push(r.id);
  }

  if (input.personalData) {
    const r = await recordLegalConsent(db, {
      kind: "personal_data",
      status: "granted",
      source: input.source,
      userId,
      organizationId: orgId,
      siteLeadId: input.siteLeadId,
      contactRaw: input.contactRaw,
    });
    ids.push(r.id);
  }

  if (input.marketing === true) {
    const r = await recordLegalConsent(db, {
      kind: "marketing",
      status: "granted",
      source: input.source,
      userId,
      organizationId: orgId,
      siteLeadId: input.siteLeadId,
      contactRaw: input.contactRaw,
    });
    ids.push(r.id);
  } else if (input.marketing === false) {
    const r = await recordLegalConsent(db, {
      kind: "marketing",
      status: "withdrawn",
      source: input.source,
      userId,
      organizationId: orgId,
      siteLeadId: input.siteLeadId,
      contactRaw: input.contactRaw,
    });
    ids.push(r.id);
  }

  if (input.publicOffer) {
    const r = await recordLegalConsent(db, {
      kind: "public_offer",
      status: "granted",
      source: input.source,
      userId,
      organizationId: orgId,
      siteLeadId: input.siteLeadId,
      contactRaw: input.contactRaw,
    });
    ids.push(r.id);
  }

  if (input.cookie) {
    const r = await recordLegalConsent(db, {
      kind: "cookie_prefs",
      status: "granted",
      source: input.source,
      userId,
      organizationId: orgId,
      documentVersion: "cookie-notice-v1",
      payload: {
        necessary: true,
        analytics: input.cookie.analytics,
        marketing: input.cookie.marketing,
        yandexMetrika: false,
      },
    });
    ids.push(r.id);
  }

  return { ids };
}
