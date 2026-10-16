import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl space-y-1">
        <h1 className="font-display text-[1.55rem] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-[0.925rem]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
