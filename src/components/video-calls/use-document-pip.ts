"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  injectDocumentPipStyles,
  isDocumentPipSupported,
  openDocumentPipWindow,
  type DocumentPipOptions,
} from "@/lib/video/document-pip";

export function useDocumentPip() {
  const winRef = useRef<Window | null>(null);
  const rootRef = useRef<Root | null>(null);
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isDocumentPipSupported());
  }, []);

  const close = useCallback(() => {
    try {
      winRef.current?.close();
    } catch {
      /* already closed */
    }
  }, []);

  const teardown = useCallback(() => {
    rootRef.current?.unmount();
    rootRef.current = null;
    winRef.current = null;
    setOpen(false);
  }, []);

  const openPip = useCallback(
    async (size: DocumentPipOptions) => {
      if (!isDocumentPipSupported()) {
        throw new Error("Document Picture-in-Picture недоступен в этом браузере");
      }
      if (winRef.current && !winRef.current.closed) {
        winRef.current.focus();
        return;
      }
      const pip = await openDocumentPipWindow(size);
      injectDocumentPipStyles(pip);
      const host = pip.document.createElement("div");
      host.id = "neodin-pip";
      pip.document.body.append(host);
      rootRef.current = createRoot(host);
      winRef.current = pip;
      setOpen(true);
      pip.addEventListener("pagehide", teardown);
    },
    [teardown]
  );

  const render = useCallback((node: ReactNode) => {
    rootRef.current?.render(node);
  }, []);

  return {
    open,
    supported,
    openPip,
    close,
    render,
  };
}
