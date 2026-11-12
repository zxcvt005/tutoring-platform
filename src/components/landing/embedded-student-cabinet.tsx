"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Play } from "lucide-react";

import { StudentTourShell } from "@/components/student-tour/tour-shell";
import { Button } from "@/components/ui/button";
import {
  STUDENT_TOUR_BASE_PATH,
  STUDENT_TOUR_EMBED_STORAGE_KEY,
} from "@/lib/student-tour/constants";
import {
  normalizeStudentTourHref,
  renderStudentTourRoute,
} from "@/lib/student-tour/embedded-routes";
import { StudentTourPathProvider } from "@/lib/student-tour/paths";
import { StudentTourProvider } from "@/lib/student-tour/provider";
import { cn } from "@/lib/utils";

/** Логический размер кабинета до scale; внешний viewport держит тот же aspect-ratio. */
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 800;

type TourStep = {
  selector: string;
  holdMs: number;
  settleMs?: number;
};

const TOUR_STEPS: TourStep[] = [
  { selector: '[data-tour-nav="homework"]', holdMs: 900, settleMs: 700 },
  { selector: "[data-tour-homework-link]", holdMs: 1100, settleMs: 900 },
  { selector: '[data-tour-nav="theory"]', holdMs: 900, settleMs: 700 },
  { selector: '[data-tour-nav="history"]', holdMs: 900, settleMs: 700 },
  { selector: '[data-tour-nav="calls"]', holdMs: 900, settleMs: 700 },
  { selector: '[data-tour-nav="home"]', holdMs: 1200, settleMs: 600 },
];

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export function EmbeddedStudentCabinet() {
  const [pathname, setPathname] = useState(STUDENT_TOUR_BASE_PATH);
  const [scale, setScale] = useState(0.55);
  const [autoPlay, setAutoPlay] = useState(true);
  const [cursor, setCursor] = useState({
    x: 24,
    y: 24,
    visible: false,
    pulse: false,
  });
  const shellRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tourClickingRef = useRef(false);

  const navigate = useCallback((href: string) => {
    const next = normalizeStudentTourHref(href);
    if (!next.startsWith(STUDENT_TOUR_BASE_PATH)) return;
    setPathname(next);
  }, []);

  const stopAuto = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAutoPlay(false);
    setCursor((prev) => ({ ...prev, visible: false, pulse: false }));
  }, []);

  const startAuto = useCallback(() => {
    setPathname(STUDENT_TOUR_BASE_PATH);
    setAutoPlay(true);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Scale только от ширины: высота карточки задаётся aspect-ratio = FRAME.
    // transform не влияет на layout — поэтому высота не vh, а доля ширины.
    const update = () => {
      const width = viewport.clientWidth;
      if (width < 40) return;
      setScale(width / FRAME_WIDTH);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;

    const onClickCapture = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !root.contains(anchor)) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      const normalized = normalizeStudentTourHref(href);
      if (!normalized.startsWith(STUDENT_TOUR_BASE_PATH)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // Клики автотура помечаются tourClickingRef; любой другой клик — ручной режим.
      if (!tourClickingRef.current) stopAuto();
      navigate(normalized);
    };

    const onTrustedPointer = () => {
      if (!tourClickingRef.current) stopAuto();
    };

    root.addEventListener("click", onClickCapture, true);
    root.addEventListener("pointerdown", onTrustedPointer, true);
    root.addEventListener("keydown", onTrustedPointer, true);
    return () => {
      root.removeEventListener("click", onClickCapture, true);
      root.removeEventListener("pointerdown", onTrustedPointer, true);
      root.removeEventListener("keydown", onTrustedPointer, true);
    };
  }, [navigate, stopAuto]);

  useEffect(() => {
    if (!autoPlay) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    async function run() {
      const root = shellRef.current;
      if (!root) return;
      setCursor({ x: 40, y: 80, visible: true, pulse: false });

      while (!signal.aborted) {
        for (const step of TOUR_STEPS) {
          if (signal.aborted) return;
          const target = await waitForSelector(root, step.selector, signal);
          if (!target) continue;

          const point = relativePoint(root, target);
          setCursor({ ...point, visible: true, pulse: false });
          await wait(step.holdMs, signal);
          if (signal.aborted) return;

          setCursor({ ...point, visible: true, pulse: true });
          await wait(140, signal);
          // Программный клик: native capture перехватит Link и сделает soft-navigate.
          tourClickingRef.current = true;
          try {
            target.click();
          } finally {
            tourClickingRef.current = false;
          }
          setCursor({ ...point, visible: true, pulse: false });
          await wait(step.settleMs ?? 600, signal);
        }
        await wait(1400, signal);
        setPathname(STUDENT_TOUR_BASE_PATH);
        await wait(700, signal);
      }
    }

    void run().catch(() => undefined);
    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [autoPlay]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={viewportRef}
        className="landing-surface relative w-full overflow-hidden"
        style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}` }}
      >
        <div
          ref={shellRef}
          className="absolute top-0 left-0 origin-top-left overflow-hidden bg-transparent"
          style={
            {
              width: FRAME_WIDTH,
              height: FRAME_HEIGHT,
              transform: `scale(${scale})`,
            } satisfies CSSProperties
          }
          onWheel={(event) => event.stopPropagation()}
        >
          <StudentTourProvider
            mode="embedded"
            storageKey={STUDENT_TOUR_EMBED_STORAGE_KEY}
            wrapPathProvider={false}
            onLogout={() => {
              stopAuto();
              setPathname(STUDENT_TOUR_BASE_PATH);
            }}
          >
            <StudentTourPathProvider
              active
              mode="embedded"
              pathname={pathname}
              navigate={navigate}
            >
              <StudentTourShell variant="embedded">
                {renderStudentTourRoute(pathname)}
              </StudentTourShell>
            </StudentTourPathProvider>
          </StudentTourProvider>

          {cursor.visible ? (
            <TourCursor x={cursor.x} y={cursor.y} pulse={cursor.pulse} />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {autoPlay ? (
          <p className="text-sm text-foreground/60">
            Идёт автодемонстрация. Кликните внутри кабинета, чтобы управлять
            сами.
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl border-black/10 bg-white/55"
            onClick={startAuto}
          >
            <Play className="size-3.5" />
            Снова показать демо
          </Button>
        )}
      </div>
    </div>
  );
}

async function waitForSelector(
  root: HTMLElement,
  selector: string,
  signal: AbortSignal
) {
  const started = Date.now();
  while (!signal.aborted && Date.now() - started < 5000) {
    const node = root.querySelector(selector);
    if (node instanceof HTMLElement) return node;
    await wait(120, signal).catch(() => undefined);
  }
  return null;
}

function relativePoint(root: HTMLElement, target: HTMLElement) {
  const rootBox = root.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const scaleX = rootBox.width / Math.max(root.offsetWidth, 1);
  const scaleY = rootBox.height / Math.max(root.offsetHeight, 1);
  return {
    x: (box.left + box.width / 2 - rootBox.left) / scaleX,
    y: (box.top + box.height / 2 - rootBox.top) / scaleY,
  };
}

function TourCursor({
  x,
  y,
  pulse,
}: {
  x: number;
  y: number;
  pulse: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-500 ease-out"
      style={{ left: x, top: y }}
    >
      <span
        className={cn(
          "absolute -inset-3 rounded-full bg-foreground/20 transition-opacity",
          pulse ? "opacity-100" : "opacity-0"
        )}
      />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 3.5 19 12l-6.2 1.6L10.5 21 5 3.5Z"
          fill="currentColor"
          className="text-foreground"
          stroke="white"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}
