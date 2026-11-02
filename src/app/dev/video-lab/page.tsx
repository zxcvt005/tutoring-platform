import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { VideoLabClient } from "@/components/dev/video-lab-client";
import { isVideoLabEnabled } from "@/server/video/lab-access";

export const metadata: Metadata = {
  title: "Видеолаборатория",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function VideoLabPage() {
  if (!isVideoLabEnabled()) notFound();
  return (
    <Suspense
      fallback={
        <p className="px-6 py-10 text-sm text-muted-foreground">
          Загрузка лаборатории…
        </p>
      }
    >
      <VideoLabClient />
    </Suspense>
  );
}
