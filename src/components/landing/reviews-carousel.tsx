"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ImageLightbox } from "@/components/landing/image-lightbox";
import { reviewRoleLabel, type LandingReview } from "@/lib/landing/results";
import { cn } from "@/lib/utils";

export function ReviewsCarousel({ reviews }: { reviews: readonly LandingReview[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(true);
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const count = reviews.length;

  if (count === 0) {
    return (
      <div className="mt-16 border-t border-black/10 pt-12">
        <h3 className="font-display text-3xl font-semibold tracking-tight">
          Отзывы учеников и родителей
        </h3>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/70">
          Скриншоты отзывов появятся здесь, когда файлы будут добавлены.
        </p>
      </div>
    );
  }

  const current = reviews[index] ?? reviews[0]!;

  function go(next: number) {
    const normalized = ((next % count) + count) % count;
    const wraps =
      (index === 0 && normalized === count - 1) ||
      (index === count - 1 && normalized === 0);
    setSlide(!wraps);
    setIndex(normalized);
  }

  return (
    <div className="mt-16 border-t border-black/10 pt-12">
      <h3 className="font-display text-3xl font-semibold tracking-tight">
        Отзывы учеников и родителей
      </h3>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/70">
        Скриншоты переписок и отзывов. Текст на картинке не пересказывается.
      </p>

      <div
        role="region"
        aria-roledescription="карусель"
        aria-label="Отзывы учеников и родителей"
        tabIndex={0}
        className="mt-8 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(index + 1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(index - 1);
          }
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {current.role ? reviewRoleLabel(current.role) : "Отзыв"}
            <span className="sr-only">
              {`, ${index + 1} из ${count}`}
            </span>
          </p>
          <div className="flex gap-2">
            <CarouselButton label="Предыдущий отзыв" onClick={() => go(index - 1)}>
              <ChevronLeft />
            </CarouselButton>
            <CarouselButton label="Следующий отзыв" onClick={() => go(index + 1)}>
              <ChevronRight />
            </CarouselButton>
          </div>
        </div>

        <div
          className="overflow-hidden touch-pan-y"
          onPointerDown={(event) => {
            startX.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (startX.current == null) return;
            const delta = event.clientX - startX.current;
            startX.current = null;
            if (Math.abs(delta) > 48) {
              swiped.current = true;
              go(delta > 0 ? index - 1 : index + 1);
            }
          }}
          onPointerCancel={() => {
            startX.current = null;
          }}
        >
          <div
            className={cn(
              "flex",
              slide &&
                "motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
            )}
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {reviews.map((review, reviewIndex) => (
              <div
                key={review.id}
                className="w-full shrink-0 px-1"
                inert={reviewIndex !== index}
              >
                <button
                  type="button"
                  className="mx-auto block max-w-3xl cursor-zoom-in focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={
                    review.role
                      ? `Открыть отзыв: ${reviewRoleLabel(review.role)}`
                      : "Открыть отзыв"
                  }
                  onClick={() => {
                    if (swiped.current) {
                      swiped.current = false;
                      return;
                    }
                    setIndex(reviewIndex);
                    setOpen(true);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={review.src}
                    alt={
                      review.role
                        ? `Отзыв: ${reviewRoleLabel(review.role)}`
                        : "Отзыв"
                    }
                    draggable={false}
                    className="mx-auto h-auto max-h-[70vh] w-auto max-w-full"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Номер отзыва">
          {reviews.map((review, reviewIndex) => (
            <button
              key={review.id}
              type="button"
              role="tab"
              aria-selected={reviewIndex === index}
              aria-label={`Отзыв ${reviewIndex + 1}`}
              className={cn(
                "size-2 rounded-full",
                reviewIndex === index ? "bg-foreground" : "bg-foreground/25"
              )}
              onClick={() => go(reviewIndex)}
            />
          ))}
        </div>
      </div>

      <ImageLightbox
        images={reviews.map((review) => ({
          src: review.src,
          alt: review.role
            ? `Отзыв: ${reviewRoleLabel(review.role)}`
            : "Отзыв",
        }))}
        index={index}
        open={open}
        onOpenChange={setOpen}
        onIndexChange={setIndex}
      />
    </div>
  );
}

function CarouselButton({
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
      className="inline-flex size-10 items-center justify-center rounded-xl border border-black/10 bg-auditoria-surface hover:bg-pastel-blue/70"
    >
      {children}
    </button>
  );
}
