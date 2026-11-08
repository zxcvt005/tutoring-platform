"use client";

import katex from "katex";
import { useMemo } from "react";

import {
  EMPTY_EXPLANATION_MESSAGE,
  splitRichTextMath,
  textSegmentToHtml,
} from "@/lib/math/rich-text-math";
import { cn } from "@/lib/utils";

import "katex/dist/katex.min.css";

function renderMath(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: display,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return textSegmentToHtml(latex);
  }
}

export function RichTextWithMath({
  text,
  className,
  emptyMessage = EMPTY_EXPLANATION_MESSAGE,
}: {
  text: string | null | undefined;
  className?: string;
  emptyMessage?: string;
}) {
  const html = useMemo(() => {
    const raw = (text ?? "").trim();
    if (!raw) return null;
    return splitRichTextMath(raw)
      .map((segment) => {
        if (segment.kind === "text") return textSegmentToHtml(segment.value);
        const math = renderMath(segment.value, segment.display);
        return segment.display
          ? `<div class="my-3 overflow-x-auto text-center">${math}</div>`
          : `<span class="mx-0.5 inline-block max-w-full overflow-x-auto align-middle">${math}</span>`;
      })
      .join("");
  }, [text]);

  if (!html) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rich-text-math text-sm leading-relaxed text-foreground [&_.katex-display]:my-0",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
