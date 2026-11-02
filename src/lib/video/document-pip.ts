export type DocumentPipOptions = {
  width: number;
  height: number;
};

type DocumentPipApi = {
  requestWindow: (options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }) => Promise<Window>;
};

export function isDocumentPipSupported(
  target: Window | undefined = typeof window === "undefined" ? undefined : window
): boolean {
  if (!target) return false;
  const api = (target as Window & { documentPictureInPicture?: DocumentPipApi })
    .documentPictureInPicture;
  return typeof api?.requestWindow === "function";
}

export async function openDocumentPipWindow(
  options: DocumentPipOptions
): Promise<Window> {
  if (!isDocumentPipSupported()) {
    throw new Error("Document Picture-in-Picture недоступен в этом браузере");
  }
  const api = (window as unknown as { documentPictureInPicture: DocumentPipApi })
    .documentPictureInPicture;
  return api.requestWindow({
    width: options.width,
    height: options.height,
    disallowReturnToOpener: false,
  });
}

const PIP_CSS = `
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #141414; color: #f4f4f5; font-family: ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  button { font: inherit; }
  #neodin-pip { height: 100%; }
`;

export function injectDocumentPipStyles(pip: Window) {
  const style = pip.document.createElement("style");
  style.textContent = PIP_CSS;
  pip.document.head.append(style);
  pip.document.documentElement.lang = "ru";
  pip.document.title = "Звонок Неодин";
}
