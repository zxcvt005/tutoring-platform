import { isAllowedEmbedUrl, videoProviderLabel } from "@/lib/theory/video";
import type { TheoryVideoProvider } from "@/lib/theory/video";

export function VideoEmbed({
  embedUrl,
  embedAllowed,
  watchUrl,
  provider,
  warning,
}: {
  embedUrl?: string | null;
  embedAllowed?: boolean;
  watchUrl?: string | null;
  provider?: TheoryVideoProvider | null;
  warning?: string | null;
}) {
  const canEmbed = Boolean(
    embedAllowed && embedUrl && isAllowedEmbedUrl(embedUrl)
  );
  return (
    <div className="space-y-2">
      {canEmbed ? (
        <div className="relative w-full overflow-hidden rounded-xl bg-black pt-[56.25%]">
          <iframe
            src={embedUrl!}
            title={videoProviderLabel(provider ?? "unknown")}
            className="absolute inset-0 h-full w-full border-0"
            allow="encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-6 text-sm">
          <p>
            Это видео нельзя встроить на сайт. Откройте его на платформе
            источника.
          </p>
        </div>
      )}
      {warning ? (
        <p className="text-xs text-muted-foreground">{warning}</p>
      ) : null}
      {watchUrl ? (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm hover:bg-muted/50"
        >
          Открыть видео на платформе
        </a>
      ) : null}
    </div>
  );
}
