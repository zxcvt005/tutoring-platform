import { cn } from "@/lib/utils";

export function VideoTile({
  label,
  videoRef,
  audioRef,
  empty,
  mirror,
  onClick,
  className,
}: {
  label: string;
  videoRef?: React.Ref<HTMLVideoElement>;
  audioRef?: React.Ref<HTMLAudioElement>;
  empty?: string;
  mirror?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-zinc-950",
        className
      )}
      onClick={onClick}
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
      <p className="absolute bottom-2 left-2 z-10 rounded-full bg-background/85 px-2 py-0.5 text-xs">
        {label}
      </p>
      {empty ? (
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : null}
    </div>
  );
}
