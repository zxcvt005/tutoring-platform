import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";

export const metadata: Metadata = {
  title: "Дирекция",
};

export default function DirekciyaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CabinetShell role="direkciya">{children}</CabinetShell>;
}
