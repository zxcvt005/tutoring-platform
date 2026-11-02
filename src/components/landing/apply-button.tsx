"use client";

import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  useLandingApply,
  type LandingApplyPrefill,
} from "./landing-apply-context";

type ApplyButtonProps = LandingApplyPrefill &
  VariantProps<typeof buttonVariants> & {
    children?: string;
    className?: string;
    onBeforeApply?: () => void;
  };

export function ApplyButton({
    children = "Начать с диагностики",
  subjectId,
  tariffId,
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
      className={cn("h-10 rounded-xl px-4", className)}
      render={<a href="#apply" />}
      onClick={(event) => {
        event.preventDefault();
        onBeforeApply?.();
        apply({ subjectId, tariffId });
      }}
    >
      {children}
    </Button>
  );
}
