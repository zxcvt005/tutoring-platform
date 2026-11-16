"use client";

import type { SettlementDocumentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function labelFor(doc: SettlementDocumentSummary): string {
  if (doc.kind === "income_return") {
    return `Скачать возврат № ${doc.sequentialNumber}`;
  }
  return `Скачать расчёт № ${doc.sequentialNumber}`;
}

export function SettlementDownloadLinks({
  documents,
  className,
  linkClassName,
}: {
  documents: SettlementDocumentSummary[];
  className?: string;
  linkClassName?: string;
}) {
  if (documents.length === 0) return null;
  const sorted = [...documents].sort(
    (a, b) => a.sequentialNumber - b.sequentialNumber
  );
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {sorted.map((doc) => (
        <a
          key={doc.id}
          href={`/api/settlements/${encodeURIComponent(doc.id)}/pdf`}
          className={cn(
            "text-xs font-medium underline-offset-2 hover:underline",
            linkClassName
          )}
        >
          {labelFor(doc)}
        </a>
      ))}
    </div>
  );
}
