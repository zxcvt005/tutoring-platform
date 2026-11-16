import type { Metadata } from "next";

import { PersonalDataConsentPage } from "@/components/legal/legal-document-pages";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

const meta = LEGAL_DOCUMENTS["personal-data-consent"];

export const metadata: Metadata = {
  title: meta.title,
  description: "Согласие на обработку персональных данных",
};

export default function Page() {
  return <PersonalDataConsentPage />;
}
