import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";
import { requireCabinetMembership } from "@/server/auth/cabinet-guard";

export const metadata: Metadata = {
  title: "Пресса",
};

export default async function PressaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCabinetMembership("pressa");
  return <CabinetShell role="pressa">{children}</CabinetShell>;
}
