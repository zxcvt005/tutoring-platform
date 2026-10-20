import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Первичная настройка",
};

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
