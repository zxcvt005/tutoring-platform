"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Check, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HintTooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  AUDITORIA_BACKGROUNDS,
  AUDITORIA_COLOR_BACKGROUNDS,
  DEFAULT_AUDITORIA_BACKGROUND_ID,
  applyAuditoriaBackgroundToDocument,
  getAuditoriaBackground,
  readStoredAuditoriaBackgroundId,
  subscribeAuditoriaBackground,
  writeStoredAuditoriaBackgroundId,
  type AuditoriaBackground,
} from "@/lib/auditoria-backgrounds";
import { cn } from "@/lib/utils";

type AuditoriaBackgroundContextValue = {
  background: AuditoriaBackground;
  select: (id: string) => void;
};

const AuditoriaBackgroundContext =
  createContext<AuditoriaBackgroundContextValue | null>(null);

export function AuditoriaBackgroundProvider({
  children,
}: {
  children: ReactNode;
}) {
  const id = useSyncExternalStore(
    subscribeAuditoriaBackground,
    readStoredAuditoriaBackgroundId,
    () => DEFAULT_AUDITORIA_BACKGROUND_ID
  );

  const select = useCallback((nextId: string) => {
    writeStoredAuditoriaBackgroundId(nextId);
  }, []);

  useLayoutEffect(() => {
    applyAuditoriaBackgroundToDocument(readStoredAuditoriaBackgroundId());
  }, [id]);

  const value = useMemo(
    () => ({
      background: getAuditoriaBackground(id),
      select,
    }),
    [id, select]
  );

  return (
    <AuditoriaBackgroundContext.Provider value={value}>
      {children}
    </AuditoriaBackgroundContext.Provider>
  );
}

function useAuditoriaBackground() {
  const context = useContext(AuditoriaBackgroundContext);
  if (!context) {
    throw new Error(
      "useAuditoriaBackground must be used within AuditoriaBackgroundProvider"
    );
  }
  return context;
}

export function AuditoriaBackgroundLayer() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="auditoria-bg-layer absolute inset-0" />
      <div className="absolute inset-0 bg-background/30" />
    </div>
  );
}

export function AuditoriaBackgroundPicker({
  className,
}: {
  className?: string;
}) {
  const { background, select } = useAuditoriaBackground();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <TooltipProvider>
        <HintTooltip text="Изменить фон">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Изменить фон"
            aria-expanded={open}
            aria-haspopup="dialog"
            className="size-10 rounded-full border-black/10 bg-auditoria-surface shadow-sm"
            onClick={() => setOpen((current) => !current)}
          >
            <ImageIcon />
          </Button>
        </HintTooltip>
      </TooltipProvider>
      {open ? (
        <div
          role="dialog"
          aria-label="Фон кабинета"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-50 flex w-72 max-h-[min(28rem,calc(100svh-6rem))] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-black/10 bg-auditoria-surface p-3 text-foreground shadow-md"
        >
          <div className="grid min-h-0 gap-4 overflow-y-auto">
            <section>
              <p className="font-display text-sm font-semibold text-foreground">
                Цветовые фоны
              </p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {AUDITORIA_COLOR_BACKGROUNDS.map((item) => {
                  const selected = item.id === background.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Цветовой фон ${item.swatch}`}
                      aria-pressed={selected}
                      className={cn(
                        "aspect-square w-full rounded-md",
                        selected
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-popover"
                          : "ring-1 ring-border/80"
                      )}
                      style={{ backgroundColor: item.swatch }}
                      onClick={() => select(item.id)}
                    />
                  );
                })}
              </div>
            </section>
            <section>
              <p className="font-display text-sm font-semibold text-foreground">
                Изображения
              </p>
              <div className="mt-2 grid gap-2">
            {AUDITORIA_BACKGROUNDS.map((item) => {
              const selected = item.id === background.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className="flex flex-col items-stretch gap-1.5 rounded-md p-1 text-left transition-colors hover:bg-muted"
                  onClick={() => select(item.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.src}
                    alt=""
                    className={cn(
                      "h-20 w-full rounded-md object-cover",
                      selected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-popover"
                        : "ring-1 ring-border/80"
                    )}
                  />
                  <span className="flex items-center justify-between gap-2 px-0.5 text-sm">
                    {item.name}
                    {selected ? (
                      <Check
                        className="size-4 text-primary"
                        aria-label="Выбрано"
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
