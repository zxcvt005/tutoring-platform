"use client";

import { MicOff, VideoOff } from "lucide-react";

import { cn } from "@/lib/utils";

export function GroupParticipantTile({
  label,
  videoRef,
  audioRef,
  mirror,
  empty,
  micMuted,
  cameraOff,
  featured = false,
  className,
}: {
  label: string;
  videoRef?: React.Ref<HTMLVideoElement>;
  audioRef?: React.Ref<HTMLAudioElement>;
  mirror?: boolean;
  empty?: string;
  micMuted?: boolean;
  cameraOff?: boolean;
  featured?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-zinc-950",
        featured ? "aspect-[16/10]" : "aspect-[4/3]",
        className
      )}
    >
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 size-full bg-zinc-950 object-contain",
          mirror && "scale-x-[-1]"
        )}
        autoPlay
        playsInline
        muted
      />
      {audioRef ? <audio ref={audioRef} autoPlay /> : null}
      {cameraOff || empty ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/80 px-4 text-center">
          {cameraOff ? (
            <VideoOff className="size-7 text-muted-foreground sm:size-8" />
          ) : null}
          <p className="text-sm text-muted-foreground">
            {empty ?? "Камера выключена"}
          </p>
        </div>
      ) : null}
      <div className="absolute bottom-2 left-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1.5">
        <p className="truncate rounded-full bg-background/85 px-2 py-0.5 text-xs">
          {label}
        </p>
        {micMuted ? (
          <span
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-background/85 text-destructive"
            title="Микрофон выключен"
            aria-label="Микрофон выключен"
          >
            <MicOff className="size-3.5" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
