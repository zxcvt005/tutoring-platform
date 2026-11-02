"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export type LightboxImage = {
  src: string;
  alt: string;
};

export function ImageLightbox({
  images,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: {
  images: readonly LightboxImage[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}) {
  const current = images[index];
  const multiple = images.length > 1;

  useEffect(() => {
    if (!open || !multiple) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange((index + 1) % images.length);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange((index - 1 + images.length) % images.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, multiple, onIndexChange, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-auto max-w-[min(96vw,56rem)] border-0 bg-background pt-10 pr-10 pb-3 pl-3 shadow-none ring-0 sm:max-w-[min(96vw,56rem)] sm:pt-12 sm:pr-12 sm:pb-4 sm:pl-4"
        showCloseButton
      >
        <DialogTitle className="sr-only">
          {current?.alt ?? "Изображение"}
        </DialogTitle>
        {current ? (
          <div className="flex items-center gap-2">
            {multiple ? (
              <LightboxStep
                label="Предыдущий скриншот"
                onClick={() =>
                  onIndexChange((index - 1 + images.length) % images.length)
                }
              >
                <ChevronLeft />
              </LightboxStep>
            ) : null}
            {/* Полный кадр без обрезки: картинка уменьшается целиком, пропорции сохраняются. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={current.alt}
              className="mx-auto h-auto max-h-[85vh] w-auto max-w-full"
            />
            {multiple ? (
              <LightboxStep
                label="Следующий скриншот"
                onClick={() => onIndexChange((index + 1) % images.length)}
              >
                <ChevronRight />
              </LightboxStep>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LightboxStep({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted"
    >
      {children}
    </button>
  );
}

export function ZoomableImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className ?? "h-auto w-full"} />
      </button>
      <ImageLightbox
        images={[{ src, alt }]}
        index={0}
        open={open}
        onOpenChange={setOpen}
        onIndexChange={() => undefined}
      />
    </>
  );
}
