import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AUDITORIA_BACKGROUNDS,
  AUDITORIA_COLOR_BACKGROUNDS,
  AUDITORIA_BACKGROUND_MOBILE_MAX_PX,
  AUDITORIA_BACKGROUND_STORAGE_KEY,
  DEFAULT_AUDITORIA_BACKGROUND_ID,
  auditoriaColorSwatchFromFileName,
  auditoriaBackgroundBootScript,
  buildAuditoriaBackgroundDocumentCss,
  buildAuditoriaBackgroundLayerCss,
  getAuditoriaBackground,
  readStoredAuditoriaBackgroundId,
  resolveAuditoriaBackgroundId,
  resolveAuditoriaBackgroundSrc,
  writeStoredAuditoriaBackgroundId,
  type AuditoriaBackground,
} from "@/lib/auditoria-backgrounds";

describe("auditoria backgrounds catalog", () => {
  it("exposes paired desktop and mobile entries for backgrounds 1–10", () => {
    expect(AUDITORIA_BACKGROUNDS).toHaveLength(10);
    expect(AUDITORIA_BACKGROUNDS.map((item) => item.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `background${i + 1}`)
    );
    expect(AUDITORIA_BACKGROUNDS[0]).toEqual({
      id: "background1",
      name: "Фон 1",
      src: "/images/auditoria/backgrounds/background1.png",
      mobileSrc: "/images/auditoria/backgrounds/background1phone.png",
    });
    expect(AUDITORIA_BACKGROUNDS[9]).toEqual({
      id: "background10",
      name: "Фон 10",
      src: "/images/auditoria/backgrounds/background10.png",
      mobileSrc: "/images/auditoria/backgrounds/background10phone.png",
    });
    expect(
      AUDITORIA_BACKGROUNDS.some((item) => item.id === "background11")
    ).toBe(false);
    expect(DEFAULT_AUDITORIA_BACKGROUND_ID).toBe("color-C6B28E");
    expect(AUDITORIA_BACKGROUND_STORAGE_KEY).toBe(
      "neodin.auditoria.backgroundId"
    );
    expect(AUDITORIA_BACKGROUND_MOBILE_MAX_PX).toBe(767);
  });

  it("falls back to C6B28E when the saved id is missing", () => {
    expect(resolveAuditoriaBackgroundId(null)).toBe("color-C6B28E");
    expect(resolveAuditoriaBackgroundId("")).toBe("color-C6B28E");
    expect(resolveAuditoriaBackgroundId("background99")).toBe("color-C6B28E");
    expect(getAuditoriaBackground("background99").src).toBe(
      "/images/auditoria/backgrounds/colors/C6B28E.png"
    );
    expect(getAuditoriaBackground("background1").id).toBe("background1");
  });

  it("picks desktop or mobile file for the same catalog id", () => {
    for (const item of AUDITORIA_BACKGROUNDS) {
      const n = item.id.replace("background", "");
      expect(resolveAuditoriaBackgroundSrc(item, "desktop")).toBe(
        `/images/auditoria/backgrounds/background${n}.png`
      );
      expect(resolveAuditoriaBackgroundSrc(item, "mobile")).toBe(
        `/images/auditoria/backgrounds/background${n}phone.png`
      );
    }
  });

  it("uses the desktop file when a mobile pair is not listed", () => {
    const desktopOnly: AuditoriaBackground = {
      id: "background2",
      name: "Фон 2",
      src: "/images/auditoria/backgrounds/background2.png",
    };
    expect(resolveAuditoriaBackgroundSrc(desktopOnly, "mobile")).toBe(
      desktopOnly.src
    );
  });

  it("keeps a desktop fallback in the mobile CSS layer", () => {
    const css = buildAuditoriaBackgroundLayerCss(
      getAuditoriaBackground("background1")
    );
    expect(css).toContain("max-width:767px");
    expect(css).toContain("min-width:768px");
    expect(css).toContain(
      'url("/images/auditoria/backgrounds/background1phone.png"), url("/images/auditoria/backgrounds/background1.png")'
    );
    expect(css).toContain(
      '@media (min-width:768px){[data-auditoria-bg="background1"]{background-image:url("/images/auditoria/backgrounds/background1.png")}}'
    );
    expect(css).toContain("background-position:center");
  });
});

describe("auditoria color backgrounds", () => {
  const files = [
    "5B4BD1.png",
    "E9EEF5.png",
    "7A1D2A.png",
    "C6B28E.png",
    "17408F.png",
    "B9182F.png",
    "16724A.png",
    "2C313A.png",
  ];

  it("reads every color file and takes the swatch from its name", () => {
    const onDisk = readdirSync(
      "public/images/auditoria/backgrounds/colors"
    ).filter((name) => !name.startsWith("."));
    expect(onDisk.sort()).toEqual([...files].sort());
    expect(AUDITORIA_COLOR_BACKGROUNDS.map((item) => item.src)).toEqual(
      files.map((file) => `/images/auditoria/backgrounds/colors/${file}`)
    );

    for (const file of files) {
      const swatch = auditoriaColorSwatchFromFileName(file);
      expect(swatch).toBe(`#${file.replace(/\.[^.]+$/, "")}`);
      const item = AUDITORIA_COLOR_BACKGROUNDS.find(
        (entry) => entry.swatch === swatch
      );
      expect(item?.kind).toBe("color");
      expect(item?.mobileSrc).toBeUndefined();
      expect(item?.src.endsWith(file)).toBe(true);
    }
  });

  it("applies the image file with cover and without photo positioning", () => {
    for (const item of AUDITORIA_COLOR_BACKGROUNDS) {
      const css = buildAuditoriaBackgroundLayerCss(item);
      expect(css).toContain(`url("${item.src}")`);
      expect(css).toContain("background-size:cover");
      expect(css).not.toContain("background-color");
      expect(css).not.toContain("background-position");
      expect(css).not.toContain("max-width");
      expect(css).not.toContain("min-width");
      expect(getAuditoriaBackground(item.id)).toEqual(item);
      expect(resolveAuditoriaBackgroundId(item.id)).toBe(item.id);
      expect(resolveAuditoriaBackgroundSrc(item, "mobile")).toBe(item.src);
      expect(resolveAuditoriaBackgroundSrc(item, "desktop")).toBe(item.src);
    }
  });

  it("saves a color background through the existing storage key", () => {
    const store = new Map<string, string>();
    const previous = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window & typeof globalThis;

    try {
      writeStoredAuditoriaBackgroundId("color-5B4BD1");
      expect(store.get(AUDITORIA_BACKGROUND_STORAGE_KEY)).toBe("color-5B4BD1");
      expect(readStoredAuditoriaBackgroundId()).toBe("color-5B4BD1");
      const restored = getAuditoriaBackground(readStoredAuditoriaBackgroundId());
      const css = buildAuditoriaBackgroundLayerCss(restored);
      expect(restored.src).toBe(
        "/images/auditoria/backgrounds/colors/5B4BD1.png"
      );
      expect(css).toContain(
        'url("/images/auditoria/backgrounds/colors/5B4BD1.png")'
      );
      expect(css).not.toContain("background-color");
      expect(css).not.toContain(restored.swatch ?? "");
      store.delete(AUDITORIA_BACKGROUND_STORAGE_KEY);
      expect(readStoredAuditoriaBackgroundId()).toBe("color-C6B28E");
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        globalThis.window = previous;
      }
    }
  });
});

describe("auditoria background first paint", () => {
  it("applies C6B28E before paint and keeps a saved choice without a React id", () => {
    const css = buildAuditoriaBackgroundDocumentCss();
    expect(css).toContain(
      'html[data-auditoria-bg="color-C6B28E"] .auditoria-bg-layer{background-image:url("/images/auditoria/backgrounds/colors/C6B28E.png");background-repeat:no-repeat;background-size:cover}'
    );
    expect(css).toContain(
      'html[data-auditoria-bg="background1"] .auditoria-bg-layer{background-position:center'
    );
    const script = auditoriaBackgroundBootScript();
    expect(script).toContain('var f="color-C6B28E"');
    expect(script).toContain("localStorage.getItem");
    expect(script).toContain('setAttribute("data-auditoria-bg"');
    const layer = readFileSync(
      "src/components/auditoria/auditoria-background.tsx",
      "utf8"
    );
    expect(layer).toContain("auditoria-bg-layer");
    expect(layer).not.toContain("data-auditoria-bg={background");
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("auditoriaBackgroundBootScript()");
    expect(layout).toContain("buildAuditoriaBackgroundDocumentCss()");
    const shell = readFileSync("src/app/auditoria/layout.tsx", "utf8");
    expect(shell).toContain('<CabinetShell role="auditoria">');
  });
});
