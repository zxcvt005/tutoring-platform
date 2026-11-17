import type { Metadata } from "next";

import { AuditoriaShell } from "@/components/auditoria/auditoria-shell";
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
  return <AuditoriaShell>{children}</AuditoriaShell>;
}
