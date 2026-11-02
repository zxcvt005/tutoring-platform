export type AuditoriaBackground = {
  id: string;
  name: string;
  /** Десктопная версия, экраны от `md` и шире. У цветового фона — единственный файл. */
  src: string;
  /**
   * Мобильная версия того же фона (`backgroundNphone.png`).
   * Если файл ещё не положен в `public`, слой фона безопасно
   * показывает `src`. У цветовых фонов пары нет.
   */
  mobileSrc?: string;
  /** `color` — одно изображение без фото-позиционирования. */
  kind?: "color";
  /** `#RRGGBB` из имени файла, только для образца в селекторе. */
  swatch?: string;
};

/**
 * Совпадает с Tailwind `md` (768px) и скрытием сайдбара кабинета.
 * Ниже — мобильный файл, начиная с 768px — десктопный.
 */
export const AUDITORIA_BACKGROUND_MOBILE_MAX_PX = 767;

/**
 * Номера пар, которые реально лежат в
 * `public/images/auditoria/backgrounds/`.
 * Чтобы добавить вариант, положите `backgroundN.png` и
 * `backgroundNphone.png`, затем допишите N сюда.
 */
const AUDITORIA_BACKGROUND_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const AUDITORIA_BACKGROUNDS: readonly AuditoriaBackground[] =
  AUDITORIA_BACKGROUND_NUMBERS.map((n) => ({
    id: `background${n}`,
    name: `Фон ${n}`,
    src: `/images/auditoria/backgrounds/background${n}.png`,
    mobileSrc: `/images/auditoria/backgrounds/background${n}phone.png`,
  }));

/**
 * Файлы в `public/images/auditoria/backgrounds/colors/`.
 * Имя без расширения — HEX образца в селекторе. На страницу ставится само изображение.
 */
const AUDITORIA_COLOR_FILES = [
  "5B4BD1.png",
  "E9EEF5.png",
  "7A1D2A.png",
  "C6B28E.png",
  "17408F.png",
  "B9182F.png",
  "16724A.png",
  "2C313A.png",
] as const;

const AUDITORIA_COLOR_DIR = "/images/auditoria/backgrounds/colors";

export function auditoriaColorSwatchFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/u, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(base)) {
    throw new Error(`Некорректное имя цветового фона: ${fileName}`);
  }
  return `#${base.toUpperCase()}`;
}

export const AUDITORIA_COLOR_BACKGROUNDS: readonly AuditoriaBackground[] =
  AUDITORIA_COLOR_FILES.map((fileName) => {
    const swatch = auditoriaColorSwatchFromFileName(fileName);
    return {
      id: `color-${swatch.slice(1)}`,
      name: swatch,
      src: `${AUDITORIA_COLOR_DIR}/${fileName}`,
      kind: "color",
      swatch,
    };
  });

function allAuditoriaBackgrounds(): readonly AuditoriaBackground[] {
  return [...AUDITORIA_BACKGROUNDS, ...AUDITORIA_COLOR_BACKGROUNDS];
}

export const DEFAULT_AUDITORIA_BACKGROUND_ID = "color-C6B28E";

export const AUDITORIA_BACKGROUND_STORAGE_KEY =
  "neodin.auditoria.backgroundId";

export function getAuditoriaBackground(
  id: string | null | undefined
): AuditoriaBackground {
  return (
    allAuditoriaBackgrounds().find((item) => item.id === id) ??
    allAuditoriaBackgrounds().find(
      (item) => item.id === DEFAULT_AUDITORIA_BACKGROUND_ID
    )!
  );
}

export function resolveAuditoriaBackgroundId(
  id: string | null | undefined
): string {
  return getAuditoriaBackground(id).id;
}

export function resolveAuditoriaBackgroundSrc(
  background: AuditoriaBackground,
  viewport: "desktop" | "mobile"
): string {
  if (viewport === "mobile" && background.mobileSrc) {
    return background.mobileSrc;
  }
  return background.src;
}

function cssUrl(src: string): string {
  return `url("${src}")`;
}

/**
 * CSS слоя фона: медиазапросы, чтобы браузер не грузил ненужный файл,
 * и запасной десктопный url на мобильном, если phone-файла ещё нет.
 */
export function buildAuditoriaBackgroundLayerCss(
  background: AuditoriaBackground
): string {
  const selector = `[data-auditoria-bg="${background.id}"]`;
  if (background.kind === "color") {
    return `${selector}{background-image:${cssUrl(background.src)};background-repeat:no-repeat;background-size:cover}`;
  }

  const desktop = cssUrl(background.src);
  const mobile = background.mobileSrc
    ? `${cssUrl(background.mobileSrc)}, ${desktop}`
    : desktop;
  const mobileMax = AUDITORIA_BACKGROUND_MOBILE_MAX_PX;
  const desktopMin = mobileMax + 1;

  return [
    `${selector}{background-position:center;background-repeat:no-repeat;background-size:cover}`,
    `@media (max-width:${mobileMax}px){${selector}{background-image:${mobile}}}`,
    `@media (min-width:${desktopMin}px){${selector}{background-image:${desktop}}}`,
  ].join("");
}

const AUDITORIA_BACKGROUND_CHANGE_EVENT = "neodin:auditoria-background";

export function applyAuditoriaBackgroundToDocument(id: string): void {
  if (typeof document === "undefined") return;
  const resolved = resolveAuditoriaBackgroundId(id);
  document.documentElement.setAttribute("data-auditoria-bg", resolved);
  document.cookie = `${AUDITORIA_BACKGROUND_STORAGE_KEY}=${encodeURIComponent(resolved)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Все правила сразу, чтобы выбранный фон не подменялся после гидрации. */
export function buildAuditoriaBackgroundDocumentCss(): string {
  return allAuditoriaBackgrounds()
    .map((background) => {
      const scope = `html[data-auditoria-bg="${background.id}"] .auditoria-bg-layer`;
      if (background.kind === "color") {
        return `${scope}{background-image:${cssUrl(background.src)};background-repeat:no-repeat;background-size:cover}`;
      }
      const desktop = cssUrl(background.src);
      const mobile = background.mobileSrc
        ? `${cssUrl(background.mobileSrc)}, ${desktop}`
        : desktop;
      const mobileMax = AUDITORIA_BACKGROUND_MOBILE_MAX_PX;
      const desktopMin = mobileMax + 1;
      return [
        `${scope}{background-position:center;background-repeat:no-repeat;background-size:cover}`,
        `@media (max-width:${mobileMax}px){${scope}{background-image:${mobile}}}`,
        `@media (min-width:${desktopMin}px){${scope}{background-image:${desktop}}}`,
      ].join("");
    })
    .join("");
}

/**
 * Выполняется из head до первой отрисовки. Читает localStorage и ставит
 * атрибут на html. Разметка React этот id не содержит, поэтому гидрация
 * не расходится с сервером.
 */
export function auditoriaBackgroundBootScript(): string {
  const allowed = Object.fromEntries(
    allAuditoriaBackgrounds().map((item) => [item.id, 1])
  );
  return `(function(){var k=${JSON.stringify(AUDITORIA_BACKGROUND_STORAGE_KEY)};var f=${JSON.stringify(DEFAULT_AUDITORIA_BACKGROUND_ID)};var ok=${JSON.stringify(allowed)};var id=f;try{var s=localStorage.getItem(k);if(s&&ok[s])id=s;}catch(e){}var d=document.documentElement;d.setAttribute("data-auditoria-bg",id);document.cookie=k+"="+encodeURIComponent(id)+"; Path=/; Max-Age=31536000; SameSite=Lax";})();`;
}

export function readStoredAuditoriaBackgroundId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_AUDITORIA_BACKGROUND_ID;
  }

  try {
    return resolveAuditoriaBackgroundId(
      window.localStorage.getItem(AUDITORIA_BACKGROUND_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_AUDITORIA_BACKGROUND_ID;
  }
}

export function writeStoredAuditoriaBackgroundId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const resolved = resolveAuditoriaBackgroundId(id);
    window.localStorage.setItem(AUDITORIA_BACKGROUND_STORAGE_KEY, resolved);
    applyAuditoriaBackgroundToDocument(resolved);
  } catch {
    // Квота или режим приватного просмотра — выбор остаётся в памяти сессии.
  }

  window.dispatchEvent(new Event(AUDITORIA_BACKGROUND_CHANGE_EVENT));
}

export function subscribeAuditoriaBackground(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener(AUDITORIA_BACKGROUND_CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(AUDITORIA_BACKGROUND_CHANGE_EVENT, handler);
  };
}
