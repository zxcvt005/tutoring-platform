import type { Metadata } from "next";

import { PrivacyPolicyPage } from "@/components/legal/legal-document-pages";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

const meta = LEGAL_DOCUMENTS["privacy-policy"];

export const metadata: Metadata = {
  title: meta.title,
  description: "Политика в отношении обработки персональных данных ИП Гусын А. В.",
};

export default function Page() {
  return <PrivacyPolicyPage />;
}
