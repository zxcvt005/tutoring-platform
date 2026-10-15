import { CabinetShell } from "@/components/layout/cabinet-shell";

export default function KafedraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CabinetShell role="kafedra">{children}</CabinetShell>;
}
