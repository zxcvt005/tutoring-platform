import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";
import { landingMeta } from "@/lib/landing/content";

export const metadata: Metadata = {
  title: {
    absolute: landingMeta.title,
  },
  description: landingMeta.description,
  openGraph: {
    title: landingMeta.title,
    description: landingMeta.description,
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: landingMeta.title,
    description: landingMeta.description,
  },
};

export default function Home() {
  return <LandingPage />;
}
