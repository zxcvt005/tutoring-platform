import type { Metadata } from "next";

import { RequisitesPage } from "@/components/landing/requisites-page";
import { landingRequisitesMeta } from "@/lib/landing/requisites";

export const metadata: Metadata = {
  title: landingRequisitesMeta.title,
  description: landingRequisitesMeta.description,
  openGraph: {
    title: landingRequisitesMeta.title,
    description: landingRequisitesMeta.description,
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: landingRequisitesMeta.title,
    description: landingRequisitesMeta.description,
  },
};

export default function RekvizityRoute() {
  return <RequisitesPage />;
}
