"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatFeedbackPeriod,
  shiftFeedbackPeriod,
} from "@/lib/monthly-feedback";

export function FeedbackMonthSwitcher({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
}) {
  const prev = shiftFeedbackPeriod(year, month, -1);
  const next = shiftFeedbackPeriod(year, month, 1);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Предыдущий месяц"
        onClick={() => onChange(prev)}
      >
        <ChevronLeft />
      </Button>
      <p className="min-w-[10.5rem] text-center text-sm font-medium capitalize">
        {formatFeedbackPeriod(year, month)}
      </p>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Следующий месяц"
        onClick={() => onChange(next)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
