"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { OnboardingShell } from "@/components/students/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { StudentGrade } from "@/lib/types";

type ProfileDraft = {
  fullName: string;
  telegram: string;
  parentName: string;
  parentContacts: string;
  grade: StudentGrade | "";
  learningGoal: string;
  notes: string;
};

const EMPTY: ProfileDraft = {
  fullName: "",
  telegram: "",
  parentName: "",
  parentContacts: "",
  grade: "",
  learningGoal: "",
  notes: "",
};

function storageKey(studentId: string) {
  return `neodin.onboarding.profile.${studentId}`;
}

export default function OnboardingProfilePage() {
  const router = useRouter();
  const { auth, reload } = useDemoStore();
  const studentId = auth?.studentId ?? "";
  const [form, setForm] = useState<ProfileDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      form.fullName.trim() &&
      form.telegram.trim() &&
      form.parentName.trim() &&
      form.parentContacts.trim() &&
      form.grade &&
      form.learningGoal.trim()
    );
  }, [form]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await apiPlatform<{
          profile: {
            fullName: string;
            telegram: string;
            parentName: string;
            parentContacts: string;
            grade: StudentGrade | null;
            learningGoal: string;
            notes: string;
          };
        }>("getStudentOnboardingState", {});
        if (cancelled) return;
        const localRaw = localStorage.getItem(storageKey(studentId));
        const local = localRaw
          ? (JSON.parse(localRaw) as Partial<ProfileDraft>)
          : null;
        setForm({
          fullName: local?.fullName || state.profile.fullName || "",
          telegram: local?.telegram || state.profile.telegram || "",
          parentName: local?.parentName || state.profile.parentName || "",
          parentContacts:
            local?.parentContacts || state.profile.parentContacts || "",
          grade: (local?.grade || state.profile.grade || "") as StudentGrade | "",
          learningGoal: local?.learningGoal || state.profile.learningGoal || "",
          notes: local?.notes || state.profile.notes || "",
        });
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Не удалось загрузить анкету"
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (!studentId || !loaded) return;
    localStorage.setItem(storageKey(studentId), JSON.stringify(form));
  }, [form, studentId, loaded]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPlatform("saveStudentOnboardingProfile", {
        fullName: form.fullName,
        telegram: form.telegram,
        parentName: form.parentName,
        parentContacts: form.parentContacts,
        grade: form.grade,
        learningGoal: form.learningGoal,
        notes: form.notes,
      });
      localStorage.removeItem(storageKey(studentId));
      await reload();
      router.replace("/auditoria/onboarding/availability");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      step={1}
      title="Расскажите о себе"
      description="Заполните обязательную анкету. Без неё доступ в Аудиторию закрыт. Данные сохраняются при обновлении страницы."
    >
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label>ФИО ученика</Label>
          <Input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Telegram ученика</Label>
          <Input
            value={form.telegram}
            onChange={(e) => setForm({ ...form, telegram: e.target.value })}
            placeholder="@username"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>ФИО родителя</Label>
          <Input
            value={form.parentName}
            onChange={(e) => setForm({ ...form, parentName: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Контакт родителя (Telegram или телефон)</Label>
          <Input
            value={form.parentContacts}
            onChange={(e) =>
              setForm({ ...form, parentContacts: e.target.value })
            }
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Класс</Label>
          <select
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
            value={form.grade}
            onChange={(e) =>
              setForm({
                ...form,
                grade: e.target.value as StudentGrade | "",
              })
            }
            required
          >
            <option value="">Выберите класс</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
            <option value="10">10</option>
            <option value="11">11</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Цель обучения</Label>
          <Textarea
            value={form.learningGoal}
            onChange={(e) =>
              setForm({ ...form, learningGoal: e.target.value })
            }
            rows={3}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Дополнительная информация</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            placeholder="Необязательно"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={!canSubmit || busy} className="mt-2">
          {busy ? "Сохранение…" : "Сохранить и продолжить"}
        </Button>
      </form>
    </OnboardingShell>
  );
}
