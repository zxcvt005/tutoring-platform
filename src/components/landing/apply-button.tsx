"use client";

import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useLandingApply } from "./landing-apply-context";

type ApplyButtonProps = VariantProps<typeof buttonVariants> & {
  children?: string;
  className?: string;
  onBeforeApply?: () => void;
};

export function ApplyButton({
  children = "Начать с диагностики",
  variant = "default",
  size = "default",
  className,
  onBeforeApply,
}: ApplyButtonProps) {
  const { apply } = useLandingApply();

  return (
    <Button
      nativeButton={false}
      variant={variant}
      size={size}
      className={cn(
        "h-10 rounded-xl px-4",
        variant === "outline" && "border-black/10 bg-auditoria-surface",
        className
      )}
      render={<a href="#apply" />}
      onClick={(event) => {
        event.preventDefault();
        onBeforeApply?.();
        apply();
      }}
    >
      {children}
    </Button>
  );
}
