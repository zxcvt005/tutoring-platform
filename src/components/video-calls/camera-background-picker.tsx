"use client";

import { Images } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { callControlClass } from "@/components/video-calls/call-overlay";
import {
  CAMERA_BACKGROUND_IMAGES,
  isCameraBackgroundActive,
  type CameraBackgroundChoice,
} from "@/lib/video/camera-background";
import { cn } from "@/lib/utils";

export function CameraBackgroundPicker({
  choice,
  disabled,
  onSelect,
}: {
  choice: CameraBackgroundChoice;
  disabled?: boolean;
  onSelect: (choice: CameraBackgroundChoice) => void;
}) {
  const active = isCameraBackgroundActive(choice);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant={active ? "secondary" : "outline"}
            size="icon-lg"
            className={callControlClass}
            aria-label="Фон"
            aria-pressed={active}
          />
        }
      >
        <Images />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-64 min-w-64 max-w-[calc(100vw-1.5rem)] p-2"
      >
        <DropdownMenuLabel>Фон камеры</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => onSelect({ type: "off" })}
          className={cn(!active && "bg-accent/60")}
        >
          Без эффекта
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelect({ type: "blur" })}
          className={cn(choice.type === "blur" && "bg-accent/60")}
        >
          Размытие
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Готовые фоны</DropdownMenuLabel>
        <div className="grid grid-cols-4 gap-1.5 p-1">
          {CAMERA_BACKGROUND_IMAGES.map((image) => {
            const selected =
              choice.type === "image" && choice.id === image.id;
            return (
              <button
                key={image.id}
                type="button"
                title={image.label}
                aria-label={image.label}
                aria-pressed={selected}
                className={cn(
                  "overflow-hidden rounded-md ring-1 ring-border hover:ring-foreground/40",
                  selected && "ring-2 ring-primary"
                )}
                onClick={() => onSelect({ type: "image", id: image.id })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
