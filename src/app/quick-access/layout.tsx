import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Быстрый доступ",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function QuickAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
