import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";
import { requireCabinetMembership } from "@/server/auth/cabinet-guard";

export const metadata: Metadata = {
  title: "Аудитория",
};

export default async function AuditoriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCabinetMembership("auditoria");
  return <CabinetShell role="auditoria">{children}</CabinetShell>;
}
