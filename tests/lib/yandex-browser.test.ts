import { describe, expect, it } from "vitest";

import {
  isYandexBrowserBrands,
  isYandexBrowserEnvironment,
  isYandexBrowserUserAgent,
} from "@/lib/browser/yandex-browser";

/** Реалистичные UA с разных платформ (токены из публичных примеров). */
const UA = {
  yandexDesktopWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36",
  yandexDesktopMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36",
  yandexAndroid:
    "Mozilla/5.0 (Linux; arm_64; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.00.00 SA/3 Mobile Safari/537.36",
  yandexIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 YaBrowser/24.1.0.1234 Mobile Safari/605.1.15",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  googleAppIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/289.0.577834954 Mobile/15E148 Safari/604.1",
  googleAppAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  yaSearchApp:
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaSearchApp/24.10.0 Mobile Safari/537.36",
  yaAppAndroid:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaApp_Android/24.10.0 Mobile Safari/537.36",
  empty: "",
  unknown: "SomeCustomWebView/1.0",
} as const;

describe("isYandexBrowserUserAgent", () => {
  it("detects YaBrowser on desktop and mobile", () => {
    expect(isYandexBrowserUserAgent(UA.yandexDesktopWin)).toBe(true);
    expect(isYandexBrowserUserAgent(UA.yandexDesktopMac)).toBe(true);
    expect(isYandexBrowserUserAgent(UA.yandexAndroid)).toBe(true);
    expect(isYandexBrowserUserAgent(UA.yandexIos)).toBe(true);
  });

  it("does not treat Chrome / Chromium as Yandex despite shared tokens", () => {
    expect(isYandexBrowserUserAgent(UA.chromeDesktop)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.chromeAndroid)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.edge)).toBe(false);
  });

  it("shows info path for Safari, Google app, Firefox, unknown", () => {
    expect(isYandexBrowserUserAgent(UA.safariIos)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.safariMac)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.googleAppIos)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.googleAppAndroid)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.firefox)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.unknown)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.empty)).toBe(false);
  });

  it("does not treat Yandex apps without YaBrowser as the browser", () => {
    expect(isYandexBrowserUserAgent(UA.yaSearchApp)).toBe(false);
    expect(isYandexBrowserUserAgent(UA.yaAppAndroid)).toBe(false);
  });
});

describe("isYandexBrowserBrands / environment", () => {
  it("accepts Client Hints Yandex brand", () => {
    expect(
      isYandexBrowserBrands([
        { brand: "Not_A Brand", version: "8" },
        { brand: "Chromium", version: "120" },
        { brand: "Yandex", version: "24" },
      ])
    ).toBe(true);
    expect(
      isYandexBrowserBrands([
        { brand: "Chromium", version: "120" },
        { brand: "Yandex Browser", version: "24" },
      ])
    ).toBe(true);
  });

  it("rejects Chrome / empty brands", () => {
    expect(
      isYandexBrowserBrands([
        { brand: "Not_A Brand", version: "8" },
        { brand: "Chromium", version: "120" },
        { brand: "Google Chrome", version: "120" },
      ])
    ).toBe(false);
    expect(isYandexBrowserBrands([])).toBe(false);
    expect(isYandexBrowserBrands(null)).toBe(false);
  });

  it("environment is true only with reliable Yandex signal", () => {
    expect(
      isYandexBrowserEnvironment({ userAgent: UA.chromeDesktop })
    ).toBe(false);
    expect(
      isYandexBrowserEnvironment({ userAgent: UA.yandexDesktopWin })
    ).toBe(true);
    expect(
      isYandexBrowserEnvironment({
        userAgent: UA.chromeDesktop,
        brands: [{ brand: "Yandex", version: "24" }],
      })
    ).toBe(true);
    expect(isYandexBrowserEnvironment({})).toBe(false);
  });
});
