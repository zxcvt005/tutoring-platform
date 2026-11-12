"use client";

import { useEffect, useState } from "react";

import { landingNav } from "@/lib/landing/content";

const SECTION_IDS = landingNav.map((item) => item.href.replace(/^#/, ""));

/** Высота sticky-шапки + отступ — для якорей и зоны подсветки. */
export const LANDING_HEADER_OFFSET_PX = 88;

/**
 * Активный пункт меню: IntersectionObserver по полосе под шапкой.
 * Берём секцию с наибольшим пересечением — без дребезга на границах.
 */
export function useLandingActiveSection() {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const nodes = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (nodes.length === 0) return;

    const ratios = new Map<string, number>();

    function commit() {
      let bestId = "";
      let bestRatio = 0;
      for (const id of SECTION_IDS) {
        const ratio = ratios.get(id) ?? 0;
        if (ratio > bestRatio + 0.02) {
          bestRatio = ratio;
          bestId = id;
        } else if (Math.abs(ratio - bestRatio) <= 0.02 && ratio > 0) {
          // При близких значениях предпочитаем более позднюю секцию.
          const bestIndex = SECTION_IDS.indexOf(bestId);
          const nextIndex = SECTION_IDS.indexOf(id);
          if (nextIndex >= bestIndex) {
            bestId = id;
            bestRatio = ratio;
          }
        }
      }
      const next = bestRatio >= 0.08 ? bestId : "";
      setActiveId((prev) => (prev === next ? prev : next));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(
            entry.target.id,
            entry.isIntersecting ? entry.intersectionRatio : 0
          );
        }
        commit();
      },
      {
        root: null,
        rootMargin: `-${LANDING_HEADER_OFFSET_PX}px 0px -50% 0px`,
        threshold: [0, 0.08, 0.16, 0.28, 0.4, 0.55, 0.7, 0.85, 1],
      }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return activeId;
}

export function scrollToLandingSection(hash: string) {
  const id = hash.replace(/^#/, "");
  const node = document.getElementById(id);
  if (!node) return;
  const top =
    window.scrollY +
    node.getBoundingClientRect().top -
    LANDING_HEADER_OFFSET_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  if (SECTION_IDS.includes(id)) {
    history.replaceState(null, "", `#${id}`);
  }
}
