"use client";

import { useState } from "react";

import { ImageLightbox } from "@/components/landing/image-lightbox";

export function CaseChats({
  name,
  sources,
}: {
  name: string;
  sources: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  if (sources.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Скриншот переписки пока не добавлен.
      </p>
    );
  }

  const images = sources.map((src, imageIndex) => ({
    src,
    alt: `Переписка: ${name} сообщает результат${
      sources.length > 1 ? `, скриншот ${imageIndex + 1}` : ""
    }`,
  }));

  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Сообщение о результате
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {images.map((image, imageIndex) => (
          <li key={image.src}>
            <button
              type="button"
              className="block w-full cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => {
                setIndex(imageIndex);
                setOpen(true);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt={image.alt} className="h-auto w-full" />
            </button>
          </li>
        ))}
      </ul>
      <ImageLightbox
        images={images}
        index={index}
        open={open}
        onOpenChange={setOpen}
        onIndexChange={setIndex}
      />
    </div>
  );
}
