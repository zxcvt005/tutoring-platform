import type { Metadata } from "next";

import { PrivateTeacherDesk } from "@/components/private-calls/teacher-desk";

export const metadata: Metadata = {
  title: "Приём звонков",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PrivateCallsPage() {
  return <PrivateTeacherDesk />;
}
