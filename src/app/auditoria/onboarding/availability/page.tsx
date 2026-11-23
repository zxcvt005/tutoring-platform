"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AvailabilityWeekGrid } from "@/components/students/availability-week-grid";
import { OnboardingShell } from "@/components/students/onboarding-shell";
import { Button } from "@/components/ui/button";
import {
  MIN_AVAILABILITY_SLOTS,
  normalizeAvailabilitySlots,
} from "@/lib/students/availability";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { StudentAvailabilitySlot } from "@/lib/types";

function storageKey(studentId: string) {
  return `neodin.onboarding.slots.${studentId}`;
}

export default function OnboardingAvailabilityPage() {
  const router = useRouter();
  const { auth, reload } = useDemoStore();
  const studentId = auth?.studentId ?? "";
  const [slots, setSlots] = useState<StudentAvailabilitySlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await apiPlatform<{
          onboardingStatus: string;
          availabilitySlots: StudentAvailabilitySlot[];
        }>("getStudentOnboardingState", {});
        if (cancelled) return;
        if (
          state.onboardingStatus === "profile_pending" ||
          state.onboardingStatus === "invited"
        ) {
          router.replace("/auditoria/onboarding/profile");
          return;
        }
        const localRaw = localStorage.getItem(storageKey(studentId));
        const local = localRaw
          ? (JSON.parse(localRaw) as StudentAvailabilitySlot[])
          : null;
        setSlots(
          normalizeAvailabilitySlots(
            local?.length ? local : state.availabilitySlots ?? []
          )
        );
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Не удалось загрузить слоты"
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, router]);

  useEffect(() => {
    if (!studentId || !loaded) return;
    localStorage.setItem(storageKey(studentId), JSON.stringify(slots));
  }, [slots, studentId, loaded]);

  async function onSave() {
    if (busy) return;
    if (slots.length < MIN_AVAILABILITY_SLOTS) {
      setError(`Выберите минимум ${MIN_AVAILABILITY_SLOTS} слота`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPlatform("saveStudentOnboardingAvailability", { slots });
      localStorage.removeItem(storageKey(studentId));
      await reload();
      router.replace("/auditoria");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      step={2}
      title="Когда вам удобно заниматься?"
      description="Необязательный шаг. Можно отметить свободные часы сейчас или пропустить и сделать это позже. При сохранении желательно выбрать минимум три слота."
    >
      <AvailabilityWeekGrid slots={slots} onChange={setSlots} />
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/auditoria/onboarding/profile")}
          disabled={busy}
        >
          Назад к анкете
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.replace("/auditoria")}
          disabled={busy}
        >
          Пропустить
        </Button>
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={busy || slots.length < MIN_AVAILABILITY_SLOTS}
        >
          {busy ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </OnboardingShell>
  );
}
