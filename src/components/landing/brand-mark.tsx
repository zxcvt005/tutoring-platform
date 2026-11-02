import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "font-display font-semibold tracking-[-0.03em] text-foreground",
        size === "sm" ? "text-lg" : "text-xl",
        className
      )}
    >
      Неодин
    </span>
  );
}
