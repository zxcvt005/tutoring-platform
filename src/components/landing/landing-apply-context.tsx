"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type LandingApplyContextValue = {
  prefillNonce: number;
  apply: () => void;
};

const LandingApplyContext = createContext<LandingApplyContextValue | null>(
  null
);

export function LandingApplyProvider({ children }: { children: ReactNode }) {
  const [prefillNonce, setPrefillNonce] = useState(0);

  const apply = useCallback(() => {
    setPrefillNonce((n) => n + 1);
    window.requestAnimationFrame(() => {
      document.getElementById("apply")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      document.getElementById("lead-student-name")?.focus({ preventScroll: true });
    });
  }, []);

  const value = useMemo(
    () => ({ prefillNonce, apply }),
    [prefillNonce, apply]
  );

  return (
    <LandingApplyContext.Provider value={value}>
      {children}
    </LandingApplyContext.Provider>
  );
}

export function useLandingApply() {
  const ctx = useContext(LandingApplyContext);
  if (!ctx) {
    throw new Error("useLandingApply must be used within LandingApplyProvider");
  }
  return ctx;
}
