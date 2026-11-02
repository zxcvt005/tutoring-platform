import type { Metadata } from "next";

import { CabinetShell } from "@/components/layout/cabinet-shell";
import { requireCabinetMembership } from "@/server/auth/cabinet-guard";

export const metadata: Metadata = {
  title: "Кафедра",
};

export default async function KafedraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCabinetMembership("kafedra");
  return <CabinetShell role="kafedra">{children}</CabinetShell>;
}
