import { cn } from "@/lib/utils";

export function MediaTile({
  label,
  videoRef,
  audioRef,
  empty,
  mirror,
  fill,
}: {
  label: string;
  videoRef?: React.Ref<HTMLVideoElement>;
  audioRef?: React.Ref<HTMLAudioElement>;
  empty?: string;
  mirror?: boolean;
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-zinc-950",
        fill ? "h-full w-full" : "min-h-40"
      )}
    >
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 size-full bg-zinc-950 object-cover",
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
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : null}
    </div>
  );
}
