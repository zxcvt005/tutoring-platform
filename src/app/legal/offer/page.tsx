import type { Metadata } from "next";

import { PublicOfferPlaceholderPage } from "@/components/legal/legal-document-pages";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

const meta = LEGAL_DOCUMENTS["public-offer"];

export const metadata: Metadata = {
  title: meta.title,
  description:
    "Публичная оферта находится в стадии подготовки и будет опубликована дополнительно.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PublicOfferPlaceholderPage />;
}
