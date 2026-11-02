"use client";

import { Button } from "@/components/ui/button";
import { testArchiveButtonLabel } from "@/lib/tests/archive";
import type { HomeworkTemplateStatus } from "@/lib/types";

export function TestArchiveButton({
  status,
  busy = false,
  size = "xs",
  className,
  onToggle,
}: {
  status: HomeworkTemplateStatus;
  busy?: boolean;
  size?: "xs" | "sm";
  className?: string;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size={size}
      variant="ghost"
      className={className}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        if (busy) return;
        onToggle();
      }}
    >
      {busy ? "Сохранение…" : testArchiveButtonLabel(status)}
    </Button>
  );
}
