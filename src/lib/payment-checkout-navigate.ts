import { resolveCheckoutUrl } from "@/lib/payment-checkout";

export type OpenBankCheckoutResult =
  | { ok: true; method: "new-tab"; url: string }
  | { ok: true; method: "same-tab"; url: string }
  | {
      ok: false;
      method: "manual";
      url: string;
      reason: "popup_blocked" | "invalid_url";
    };

/**
 * Открывает страницу оплаты банка.
 *
 * Важно:
 * - НЕ открывать about:blank до ответа API (иначе popup закрывают при ошибке);
 * - НЕ вызывать window.close;
 * - URL должен быть абсолютным http(s);
 * - после async window.open часто блокируется — тогда caller показывает <a>.
 */
export function openBankCheckoutUrl(
  rawUrl: string | null | undefined,
  options?: {
    /** @default "new-tab" */
    preferred?: "new-tab" | "same-tab";
    open?: typeof window.open;
    assign?: (url: string) => void;
  }
): OpenBankCheckoutResult {
  const url = resolveCheckoutUrl(rawUrl);
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      method: "manual",
      url: "",
      reason: "invalid_url",
    };
  }

  const preferred = options?.preferred ?? "new-tab";
  const openFn =
    options?.open ??
    (typeof window !== "undefined" ? window.open.bind(window) : undefined);
  const assignFn =
    options?.assign ??
    ((href: string) => {
      if (typeof window !== "undefined") window.location.assign(href);
    });

  if (preferred === "same-tab") {
    assignFn(url);
    return { ok: true, method: "same-tab", url };
  }

  if (!openFn) {
    return { ok: false, method: "manual", url, reason: "popup_blocked" };
  }

  // Только целевой URL — без about:blank. noopener, чтобы банк не закрыл opener.
  const win = openFn(url, "_blank", "noopener,noreferrer");
  if (win) {
    return { ok: true, method: "new-tab", url };
  }
  return { ok: false, method: "manual", url, reason: "popup_blocked" };
}

/** Навигация в текущей вкладке — не блокируется popup-политикой. */
export function assignBankCheckoutUrl(
  rawUrl: string | null | undefined,
  assign?: (url: string) => void
): OpenBankCheckoutResult {
  return openBankCheckoutUrl(rawUrl, {
    preferred: "same-tab",
    assign,
  });
}
