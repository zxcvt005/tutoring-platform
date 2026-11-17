"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AvailabilityWeekGrid } from "@/components/students/availability-week-grid";
import { Button } from "@/components/ui/button";
import { apiPlatform } from "@/lib/store/api-client";
import type { StudentAvailabilitySlot } from "@/lib/types";

export function StudentAvailabilityPanel({
  studentId,
  studentName,
  canEdit,
  compact = false,
}: {
  studentId: string;
  studentName?: string;
  canEdit: boolean;
  compact?: boolean;
}) {
  const [slots, setSlots] = useState<StudentAvailabilitySlot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setDirty(false);
    void (async () => {
      try {
        const res = await apiPlatform<{
          availabilitySlots: StudentAvailabilitySlot[];
        }>("getStudentAvailability", { studentId });
        if (!cancelled) {
          setSlots(res.availabilitySlots ?? []);
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Не удалось загрузить свободное время"
          );
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function save() {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const res = await apiPlatform<{
        availabilitySlots: StudentAvailabilitySlot[];
      }>("updateStudentAvailability", { studentId, slots });
      setSlots(res.availabilitySlots ?? slots);
      setDirty(false);
      toast.success("Свободное время сохранено");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось сохранить"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        compact
          ? "space-y-3"
          : "space-y-4 rounded-2xl border border-[#E8DFD4] bg-[#FFFbf7] p-5 shadow-[0_1px_0_rgba(80,60,40,0.04)]"
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-[#5B4A63]">
            Доступность
          </h2>
          {studentName ? (
            <p className="mt-1 text-sm text-[#8A7A88]">{studentName}</p>
          ) : (
            <p className="mt-1 text-sm text-[#8A7A88]">
              Выбранные дни и часы из анкеты регистрации
            </p>
          )}
        </div>
        {canEdit && dirty ? (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        ) : null}
      </div>
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <AvailabilityWeekGrid
          slots={slots}
          readOnly={!canEdit}
          onChange={
            canEdit
              ? (next) => {
                  setSlots(next);
                  setDirty(true);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
