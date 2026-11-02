"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LandingApplyPrefill = {
  subjectId?: string;
  tariffId?: string;
};

type LandingApplyContextValue = {
  prefill: LandingApplyPrefill;
  apply: (prefill?: LandingApplyPrefill) => void;
};

const LandingApplyContext = createContext<LandingApplyContextValue | null>(
  null
);

export function LandingApplyProvider({ children }: { children: ReactNode }) {
  const [prefill, setPrefill] = useState<LandingApplyPrefill>({});

  const apply = useCallback((next?: LandingApplyPrefill) => {
    setPrefill(next ?? {});
    window.requestAnimationFrame(() => {
      document.getElementById("apply")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      document.getElementById("lead-student-name")?.focus({ preventScroll: true });
    });
  }, []);

  const value = useMemo(
    () => ({ prefill, apply }),
    [prefill, apply]
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
