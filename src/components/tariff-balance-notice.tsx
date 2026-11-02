import { assignmentTariffAlert } from "@/lib/tariff-warnings";
import type { StudentPackageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TariffBalanceNotice({
  remaining,
  packageStatus,
  compact = false,
  className,
}: {
  remaining?: number | null;
  packageStatus?: StudentPackageStatus | null;
  compact?: boolean;
  className?: string;
}) {
  const alert = assignmentTariffAlert({
    lessonsRemaining: remaining,
    packageStatus: packageStatus ?? undefined,
  });
  const text = compact ? alert.compactLabel : alert.message;
  if (!text) return null;
  const danger = alert.tone === "debt" || alert.tone === "zero";
  return (
    <p
      title={alert.message ?? undefined}
      className={cn(
        compact ? "text-[0.7rem] font-medium leading-tight" : "text-sm font-medium",
        danger
          ? "text-destructive"
          : "text-amber-800 dark:text-amber-300",
        className
      )}
    >
      {text}
    </p>
  );
}

export function LearningLockedBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-destructive/40 bg-red-50 px-4 py-3 dark:bg-red-950">
      <p className="text-sm font-medium">Тариф закончился</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function TariffRenewalMark({
  remaining,
  packageStatus,
}: {
  remaining?: number | null;
  packageStatus?: StudentPackageStatus | null;
}) {
  const alert = assignmentTariffAlert({
    lessonsRemaining: remaining,
    packageStatus: packageStatus ?? undefined,
  });
  if (!alert.needsRenewal) return null;
  return (
    <span
      title={alert.message ?? "Требуется продление тарифа"}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[0.7rem] font-bold text-white"
      aria-label={alert.message ?? "Требуется продление"}
    >
      !
    </span>
  );
}
