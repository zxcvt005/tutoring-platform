import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";
import { requireCabinetMembership } from "@/server/auth/cabinet-guard";

export const metadata: Metadata = {
  title: "Дирекция",
};

export default async function DirekciyaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCabinetMembership("direkciya");
  return <CabinetShell role="direkciya">{children}</CabinetShell>;
}
