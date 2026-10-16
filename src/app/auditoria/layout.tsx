import { CabinetShell } from "@/components/layout/cabinet-shell";

export default function AuditoriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CabinetShell role="auditoria">{children}</CabinetShell>;
}
