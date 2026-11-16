import type { Metadata } from "next";

import { MarketingConsentPage } from "@/components/legal/legal-document-pages";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

const meta = LEGAL_DOCUMENTS["marketing-consent"];

export const metadata: Metadata = {
  title: meta.title,
  description: "Согласие на рекламную рассылку электронных сообщений",
};

export default function Page() {
  return <MarketingConsentPage />;
}
