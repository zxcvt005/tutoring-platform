import type { Metadata, Viewport } from "next";
import { Geist_Mono, Literata, Manrope } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import {
  auditoriaBackgroundBootScript,
  buildAuditoriaBackgroundDocumentCss,
} from "@/lib/auditoria-backgrounds";
import { DemoStoreProvider } from "@/lib/store/demo-store";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Неодин",
    template: "%s | Неодин",
  },
  description: "Неодин — онлайн-школа подготовки к ЕГЭ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${manrope.variable} ${literata.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: buildAuditoriaBackgroundDocumentCss(),
          }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: auditoriaBackgroundBootScript() }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <DemoStoreProvider>
          {children}
          <Toaster position="top-right" />
        </DemoStoreProvider>
      </body>
    </html>
  );
}
