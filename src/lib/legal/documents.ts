/** Каталог юридических документов Неодин. Версии = даты из исходных PDF. */

export type LegalDocumentSlug =
  | "privacy-policy"
  | "personal-data-consent"
  | "marketing-consent"
  | "public-offer";

export type LegalDocumentMeta = {
  slug: LegalDocumentSlug;
  title: string;
  path: `/${string}`;
  /** null пока исходный файл не предоставлен */
  pdfPath: `/legal/${string}.pdf` | null;
  /** Версия для фиксации согласий; при обновлении PDF повышать. */
  version: string;
  publishedAt: string;
  /** false = страница-заглушка без юридического текста */
  available: boolean;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentSlug, LegalDocumentMeta> = {
  "privacy-policy": {
    slug: "privacy-policy",
    title: "Политика обработки персональных данных",
    path: "/legal/privacy-policy",
    pdfPath: "/legal/privacy-policy.pdf",
    version: "2026-06-19",
    publishedAt: "2026-06-19",
    available: true,
  },
  "personal-data-consent": {
    slug: "personal-data-consent",
    title: "Согласие на обработку персональных данных",
    path: "/legal/personal-data-consent",
    pdfPath: "/legal/personal-data-consent.pdf",
    version: "2026-06-19",
    publishedAt: "2026-06-19",
    available: true,
  },
  "marketing-consent": {
    slug: "marketing-consent",
    title: "Согласие на рекламную рассылку",
    path: "/legal/marketing-consent",
    pdfPath: "/legal/marketing-consent.pdf",
    version: "2026-06-19",
    publishedAt: "2026-06-19",
    available: true,
  },
  "public-offer": {
    slug: "public-offer",
    title: "Публичная оферта",
    path: "/legal/offer",
    pdfPath: null,
    version: "pending",
    publishedAt: "",
    available: false,
  },
};

/** Email Оператора из утверждённых юридических документов. */
export const LEGAL_OPERATOR_EMAIL = "zxcvt005@gmail.com" as const;

/** true только после публикации реального текста оферты (не заглушки). */
export function isPublicOfferPublished(): boolean {
  return LEGAL_DOCUMENTS["public-offer"].available;
}

/** Текст для страницы-заглушки оферты. Не блокирует оплату. */
export const PUBLIC_OFFER_PENDING_NOTICE =
  "Публичная оферта находится в стадии подготовки. Документ будет опубликован дополнительно." as const;

export const LEGAL_DOCUMENT_LIST = Object.values(LEGAL_DOCUMENTS);

/** Три утверждённых исходных документа (без оферты). */
export const CORE_LEGAL_DOCUMENT_SLUGS = [
  "privacy-policy",
  "personal-data-consent",
  "marketing-consent",
] as const satisfies readonly LegalDocumentSlug[];

export const CORE_LEGAL_DOCUMENTS = CORE_LEGAL_DOCUMENT_SLUGS.map(
  (slug) => LEGAL_DOCUMENTS[slug]
);

/** Точная формулировка из инструкции заказчика. */
export const PERSONAL_DATA_CONSENT_LABEL_BEFORE =
  "Я даю согласие на обработку своих персональных данных в соответствии с ";
export const PERSONAL_DATA_CONSENT_LINK_TEXT =
  "Политикой обработки персональных данных";
export const PERSONAL_DATA_CONSENT_LABEL_AFTER =
  ". С Политикой обработки персональных данных ознакомлен (-на) и согласен (-на)";

export const PUBLIC_OFFER_CONSENT_LABEL_BEFORE = "Согласен с условиями ";
export const PUBLIC_OFFER_CONSENT_LINK_TEXT = "оферты";

export type ConsentKind =
  | "privacy_ack"
  | "personal_data"
  | "marketing"
  | "cookie_prefs"
  | "public_offer";

export type ConsentSource =
  | "first_visit"
  | "cookie_banner"
  | "cookie_settings"
  | "landing_lead"
  | "register_student"
  | "invite_accept"
  | "checkout"
  | "settings";

/** Локальное хранилище анонимных предпочтений (не заменяет серверный журнал). */
export const LEGAL_CLIENT_STORAGE_KEY = "neodin.legal.prefs.v1";
