import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";

export const metadata: Metadata = {
  title: "Аудитория",
};

export default function AuditoriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CabinetShell role="auditoria">{children}</CabinetShell>;
}
