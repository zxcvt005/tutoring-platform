export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="panel-soft surface-sky px-5 py-12 text-center">
      <p className="font-display text-lg font-semibold tracking-tight text-foreground">
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
