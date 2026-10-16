import type { Metadata } from "next";
import { Geist_Mono, Literata, Manrope } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
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
  title: "Дирекция / Кафедра — прототип",
  description: "Локальный прототип управления репетиторским бизнесом",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${literata.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <DemoStoreProvider>
          {children}
          <Toaster position="top-right" />
        </DemoStoreProvider>
      </body>
    </html>
  );
}
