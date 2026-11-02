"use client";

import katex from "katex";
import { useLayoutEffect, useMemo, useRef } from "react";

import { FORMULA_MATH_WRAP_CLASS } from "@/components/formula-trainer/formula-option-styles";
import {
  expressionToLatex,
  expressionToPlain,
} from "@/lib/formula-trainer/expression-to-latex";
import { cn } from "@/lib/utils";

import "katex/dist/katex.min.css";

function fitMathToWidth(wrap: HTMLElement) {
  const math = wrap.querySelector<HTMLElement>(".katex");
  if (!math) return;
  wrap.style.fontSize = "";
  const avail = wrap.clientWidth;
  const need = math.scrollWidth;
  if (avail > 0 && need > avail + 0.5) {
    const base = Number.parseFloat(getComputedStyle(wrap).fontSize);
    if (base > 0) {
      wrap.style.fontSize = `${(avail / need) * base}px`;
    }
  }
}

export function FormulaMath({
  expression,
  className,
  display = false,
}: {
  expression: string;
  className?: string;
  display?: boolean;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const rendered = useMemo(() => {
    const fallback = expressionToPlain(expression) || expression;
    try {
      const latex = expressionToLatex(expression);
      const html = katex.renderToString(latex, {
        throwOnError: true,
        displayMode: display,
        strict: "ignore",
      });
      if (html.includes("katex-error")) {
        return { html: null as string | null, fallback };
      }
      return { html, fallback };
    } catch {
      return { html: null as string | null, fallback };
    }
  }, [expression, display]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !rendered.html) return;
    let lastAvail = Number.NaN;
    const fit = () => {
      const avail = wrap.clientWidth;
      if (avail === lastAvail) return;
      lastAvail = avail;
      fitMathToWidth(wrap);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      wrap.style.fontSize = "";
    };
  }, [rendered.html]);

  if (!rendered.html) {
    return (
      <span className={cn("text-sm leading-relaxed", className)}>
        {rendered.fallback}
      </span>
    );
  }

  return (
    <span
      ref={wrapRef}
      className={cn(FORMULA_MATH_WRAP_CLASS, className)}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
