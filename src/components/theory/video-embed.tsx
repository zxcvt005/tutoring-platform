import {
  THEORY_PLAYER_FRAME_CLASS,
  THEORY_PLAYER_SHELL_CLASS,
} from "@/lib/theory/viewer";
import {
  isAllowedEmbedUrl,
  resolveTheoryEmbedUrl,
  videoProviderLabel,
} from "@/lib/theory/video";
import type { TheoryVideoProvider } from "@/lib/theory/video";

const IFRAME_ALLOW =
  "autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock";

function watchLabel(provider?: TheoryVideoProvider | null) {
  if (provider === "vk") return "Открыть видео на VK";
  if (provider === "youtube") return "Открыть видео на YouTube";
  if (provider === "rutube") return "Открыть видео на Rutube";
  return "Открыть видео на платформе";
}

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
  const resolvedEmbed = resolveTheoryEmbedUrl(embedUrl) ?? embedUrl ?? null;
  const canEmbed = Boolean(
    embedAllowed && resolvedEmbed && isAllowedEmbedUrl(resolvedEmbed)
  );
  if (!canEmbed && !watchUrl) return null;
  return (
    <div className={`${THEORY_PLAYER_SHELL_CLASS} space-y-2`}>
      {canEmbed ? (
        <div className={THEORY_PLAYER_FRAME_CLASS}>
          <iframe
            src={resolvedEmbed!}
            title={videoProviderLabel(provider ?? "unknown")}
            className="absolute inset-0 h-full w-full border-0"
            allow={IFRAME_ALLOW}
            allowFullScreen
            referrerPolicy="origin"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-6 text-sm">
          <p>
            {provider === "vk"
              ? "Этот ролик VK нельзя показать внутри сайта. Публичный доступ на VK и разрешение на встраивание во внешний плеер — разные настройки. Откройте видео на VK."
              : "Это видео нельзя встроить на сайт. Откройте его на платформе источника."}
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
          {watchLabel(provider)}
        </a>
      ) : null}
    </div>
  );
}
