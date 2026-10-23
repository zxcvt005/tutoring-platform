/**
 * Разбор ссылок на видео и построение безопасного embed URL.
 * Не исполняет HTML из ввода преподавателя: из iframe берётся только src.
 */

export type TheoryVideoProvider = "vk" | "youtube" | "rutube" | "unknown";

export type ParsedVideoLink =
  | {
      ok: true;
      originalUrl: string;
      provider: TheoryVideoProvider;
      embedUrl: string | null;
      embedAllowed: boolean;
      watchUrl: string;
      warning?: string;
    }
  | { ok: false; error: string };

const VK_HOSTS = new Set([
  "vk.com",
  "www.vk.com",
  "m.vk.com",
  "new.vk.com",
  "vk.ru",
  "www.vk.ru",
  "m.vk.ru",
  "vkvideo.ru",
  "www.vkvideo.ru",
  "m.vkvideo.ru",
]);

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const RUTUBE_HOSTS = new Set(["rutube.ru", "www.rutube.ru"]);

const EMBED_HOSTS = new Set([
  "vk.com",
  "www.vk.com",
  "vk.ru",
  "www.vk.ru",
  "vkvideo.ru",
  "www.vkvideo.ru",
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "rutube.ru",
  "www.rutube.ru",
]);

function extractIframeSrc(input: string): string | null {
  const trimmed = input.trim();
  if (!/<\s*iframe/i.test(trimmed)) return null;
  const m = trimmed.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

function httpsUrl(url: URL): string {
  const copy = new URL(url.toString());
  copy.protocol = "https:";
  copy.username = "";
  copy.password = "";
  return copy.toString();
}

function parseRawUrl(raw: string): URL | null {
  let s = raw.trim();
  const iframeSrc = extractIframeSrc(s);
  if (iframeSrc) s = iframeSrc;
  if (!s) return null;
  if (/^(javascript|data|vbscript|file):/i.test(s)) return null;
  if (s.startsWith("//")) s = `https:${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function vkWatchUrl(oid: string, id: string): string {
  return `https://vk.com/video${oid}_${id}`;
}

function vkEmbedUrl(oid: string, id: string, hash?: string | null): string {
  const params = new URLSearchParams({ oid, id, hd: "2" });
  if (hash) params.set("hash", hash);
  return `https://vk.com/video_ext.php?${params.toString()}`;
}

function parseVkVideoId(value: string): { oid: string; id: string } | null {
  const m = /^(-?\d+)_(\d+)$/.exec(value);
  if (!m) return null;
  return { oid: m[1]!, id: m[2]! };
}

function parseVk(url: URL): ParsedVideoLink | null {
  if (!VK_HOSTS.has(hostOf(url))) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path.endsWith("/video_ext.php") || path === "/video_ext.php") {
    const oid = url.searchParams.get("oid");
    const id = url.searchParams.get("id");
    const hash = url.searchParams.get("hash");
    if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) {
      return {
        ok: false,
        error: "Некорректная ссылка на встраивание VK Видео",
      };
    }
    return {
      ok: true,
      originalUrl: httpsUrl(url),
      provider: "vk",
      embedUrl: vkEmbedUrl(oid, id, hash),
      embedAllowed: true,
      watchUrl: vkWatchUrl(oid, id),
      warning: hash
        ? undefined
        : "Если ролик не откроется внутри сайта, вставьте код из «Экспортировать» на VK — там есть ключ доступа.",
    };
  }

  const fromZ = url.searchParams.get("z");
  const zMatch = fromZ ? /(?:video|clip)(-?\d+_\d+)/.exec(fromZ) : null;
  const pathMatch = /\/(?:video|clip)(-?\d+_\d+)/.exec(path);
  const parsed = parseVkVideoId(
    zMatch?.[1] ?? pathMatch?.[1] ?? ""
  );
  if (!parsed) {
    return {
      ok: true,
      originalUrl: httpsUrl(url),
      provider: "vk",
      embedUrl: null,
      embedAllowed: false,
      watchUrl: httpsUrl(url),
      warning:
        "Не удалось определить ролик VK. Вставьте прямую ссылку вида vk.com/video-123_456 или код экспорта.",
    };
  }
  return {
    ok: true,
    originalUrl: httpsUrl(url),
    provider: "vk",
    embedUrl: vkEmbedUrl(parsed.oid, parsed.id, url.searchParams.get("hash")),
    embedAllowed: true,
    watchUrl: vkWatchUrl(parsed.oid, parsed.id),
    warning:
      "Встраивание работает для роликов, у которых разрешён показ на других сайтах. Закрытые видео откройте по кнопке на VK.",
  };
}

function youtubeId(url: URL): string | null {
  const host = hostOf(url);
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }
  const v = url.searchParams.get("v");
  if (v && /^[\w-]{6,}$/.test(v)) return v;
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") &&
    parts[1] &&
    /^[\w-]{6,}$/.test(parts[1])
  ) {
    return parts[1];
  }
  return null;
}

function parseYoutube(url: URL): ParsedVideoLink | null {
  if (!YT_HOSTS.has(hostOf(url))) return null;
  const id = youtubeId(url);
  if (!id) {
    return {
      ok: false,
      error: "Некорректная ссылка на YouTube",
    };
  }
  return {
    ok: true,
    originalUrl: httpsUrl(url),
    provider: "youtube",
    embedUrl: `https://www.youtube.com/embed/${id}`,
    embedAllowed: true,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

function parseRutube(url: URL): ParsedVideoLink | null {
  if (!RUTUBE_HOSTS.has(hostOf(url))) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id =
    parts[0] === "video" || parts[0] === "play" || parts[0] === "embed"
      ? parts[1] === "embed"
        ? parts[2]
        : parts[1]
      : null;
  if (!id || !/^[\w-]+$/.test(id)) {
    return {
      ok: true,
      originalUrl: httpsUrl(url),
      provider: "rutube",
      embedUrl: null,
      embedAllowed: false,
      watchUrl: httpsUrl(url),
      warning: "Не удалось встроить это видео Rutube. Откройте его на платформе.",
    };
  }
  return {
    ok: true,
    originalUrl: httpsUrl(url),
    provider: "rutube",
    embedUrl: `https://rutube.ru/play/embed/${id}`,
    embedAllowed: true,
    watchUrl: `https://rutube.ru/video/${id}/`,
  };
}

export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return EMBED_HOSTS.has(hostOf(parsed));
  } catch {
    return false;
  }
}

export function parseVideoLink(input: string): ParsedVideoLink {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "Укажите ссылку на видео" };
  }
  const url = parseRawUrl(raw);
  if (!url) {
    return { ok: false, error: "Некорректная ссылка на видео" };
  }

  const vk = parseVk(url);
  if (vk) return vk;
  const yt = parseYoutube(url);
  if (yt) return yt;
  const rt = parseRutube(url);
  if (rt) return rt;

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Разрешены только http(s)-ссылки" };
  }

  return {
    ok: true,
    originalUrl: httpsUrl(url),
    provider: "unknown",
    embedUrl: null,
    embedAllowed: false,
    watchUrl: httpsUrl(url),
    warning:
      "Встроенный плеер для этой платформы не поддерживается. Ученик сможет открыть видео на сайте источника.",
  };
}

export function videoProviderLabel(provider: TheoryVideoProvider): string {
  if (provider === "vk") return "VK Видео";
  if (provider === "youtube") return "YouTube";
  if (provider === "rutube") return "Rutube";
  return "Другое видео";
}
