import type { Metadata } from "next";

import { PrivateJoinDesk } from "@/components/private-calls/join-desk";

export const metadata: Metadata = {
  title: "Подключение",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PrivateJoinDesk code={code} />;
}
