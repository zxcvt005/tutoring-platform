"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CabinetShell } from "@/components/layout/cabinet-shell";
import { onboardingPathForStatus } from "@/lib/students/availability";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

export function AuditoriaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, auth } = useDemoStore();
  const isOnboarding = pathname.startsWith("/auditoria/onboarding");
  const [fetchedStatus, setFetchedStatus] = useState<string | null | undefined>(
    undefined
  );

  const me = data.students.find((s) => s.id === auth?.studentId);
  const status = me?.onboardingStatus ?? fetchedStatus;
  const gate = onboardingPathForStatus(status ?? undefined);

  useEffect(() => {
    if (!auth || auth.role !== "student") return;
    if (me?.onboardingStatus) {
      setFetchedStatus(me.onboardingStatus);
      return;
    }
    let cancelled = false;
    void apiPlatform<{ onboardingStatus: string }>(
      "getStudentOnboardingState",
      {}
    )
      .then((state) => {
        if (!cancelled) setFetchedStatus(state.onboardingStatus);
      })
      .catch(() => {
        if (!cancelled) setFetchedStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, me?.onboardingStatus]);

  useEffect(() => {
    if (!auth || auth.role !== "student") return;
    if (status === undefined) return;
    if (!gate) {
      if (isOnboarding) router.replace("/auditoria");
      return;
    }
    if (!pathname.startsWith(gate)) {
      router.replace(gate);
    }
  }, [auth, status, gate, isOnboarding, pathname, router]);

  if (isOnboarding) return <>{children}</>;
  return <CabinetShell role="auditoria">{children}</CabinetShell>;
}
