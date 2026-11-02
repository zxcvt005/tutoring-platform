"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  TrialAgreementBadge,
  TrialLessonStatusBadge,
} from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  fromAppDateTimeLocalValue,
  toAppDateTimeLocalValue,
} from "@/lib/app-time";
import { DURATION_OPTIONS } from "@/lib/types";
import {
  trialAgreementStatusLabel,
  trialLessonStatusLabel,
  type TrialAgreementStatus,
  type TrialLesson,
  type TrialLessonStatus,
} from "@/lib/trial-lessons";
import { apiPress } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

type Prefill = {
  teacherId?: string;
  startsAt?: string;
  endsAt?: string;
};

export function TrialDialog({
  open,
  onOpenChange,
  trial,
  prefill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trial?: TrialLesson | null;
  prefill?: Prefill;
  onSaved: () => void;
}) {
  const formKey = trial?.id ?? `new:${prefill?.teacherId ?? ""}:${prefill?.startsAt ?? ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <TrialDialogForm
          key={formKey}
          trial={trial}
          prefill={prefill}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function TrialDialogForm({
  trial,
  prefill,
  onOpenChange,
  onSaved,
}: {
  trial?: TrialLesson | null;
  prefill?: Prefill;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { data } = useDemoStore();
  const teachers = data.teachers.filter((t) => t.status === "active");
  const [prospectName, setProspectName] = useState(trial?.prospectName ?? "");
  const [teacherId, setTeacherId] = useState(
    trial?.teacherId ?? prefill?.teacherId ?? teachers[0]?.id ?? ""
  );
  const [startsLocal, setStartsLocal] = useState(
    trial
      ? toAppDateTimeLocalValue(trial.startsAt)
      : prefill?.startsAt
        ? toAppDateTimeLocalValue(prefill.startsAt)
        : ""
  );
  const [duration, setDuration] = useState(
    trial
      ? Math.round(
          (new Date(trial.endsAt).getTime() -
            new Date(trial.startsAt).getTime()) /
            60_000
        )
      : 60
  );
  const [teacherNotes, setTeacherNotes] = useState(trial?.teacherNotes ?? "");
  const [salesNotes, setSalesNotes] = useState(trial?.salesNotes ?? "");
  const [agreement, setAgreement] = useState<TrialAgreementStatus>(
    trial?.agreementStatus ?? "not_discussed"
  );
  const [lessonStatus, setLessonStatus] = useState<TrialLessonStatus>(
    trial?.lessonStatus ?? "planned"
  );
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const endsAtIso = useMemo(() => {
    if (!startsLocal) return "";
    try {
      const start = new Date(fromAppDateTimeLocalValue(startsLocal));
      return new Date(start.getTime() + duration * 60_000).toISOString();
    } catch {
      return "";
    }
  }, [startsLocal, duration]);

  async function save() {
    if (!prospectName.trim()) {
      toast.error("Укажите имя потенциального ученика");
      return;
    }
    if (!startsLocal) {
      toast.error("Укажите дату и время");
      return;
    }
    setBusy(true);
    try {
      const startsAt = fromAppDateTimeLocalValue(startsLocal);
      const payload = {
        prospectName,
        teacherId,
        startsAt,
        endsAt: endsAtIso,
        teacherNotes,
        salesNotes,
        agreementStatus: agreement,
        lessonStatus,
      };
      if (trial) {
        await apiPress("updateTrial", { id: trial.id, ...payload });
        toast.success("Пробный урок обновлён");
      } else {
        await apiPress("createTrial", payload);
        toast.success("Пробный урок создан");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!trial) return;
    setBusy(true);
    try {
      await apiPress("cancelTrial", {
        id: trial.id,
        cancelReason,
      });
      toast.success("Пробный урок отменён");
      setCancelOpen(false);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отменить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {trial ? "Пробный урок" : "Новый пробный урок"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Имя потенциального ученика</Label>
              <Input
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Не выбирается из списка учеников"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Преподаватель</Label>
              <Select
                value={teacherId || null}
                onValueChange={(v) => v && setTeacherId(v)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v) =>
                      teachers.find((t) => t.id === v)?.fullName ??
                      "Преподаватель"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Начало</Label>
                <Input
                  type="datetime-local"
                  value={startsLocal}
                  onChange={(e) => setStartsLocal(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Длительность</Label>
                <Select
                  value={String(duration)}
                  onValueChange={(v) => setDuration(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue>{() => `${duration} мин`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} мин
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Договорённость</Label>
                <Select
                  value={agreement}
                  onValueChange={(v) =>
                    setAgreement(v as TrialAgreementStatus)
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        trialAgreementStatusLabel[v as TrialAgreementStatus]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(trialAgreementStatusLabel) as TrialAgreementStatus[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {trialAgreementStatusLabel[k]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              {trial ? (
                <div className="space-y-1.5">
                  <Label>Фактический статус</Label>
                  <Select
                    value={lessonStatus}
                    onValueChange={(v) =>
                      setLessonStatus(v as TrialLessonStatus)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(v) => trialLessonStatusLabel[v as TrialLessonStatus]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(trialLessonStatusLabel) as TrialLessonStatus[]
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {trialLessonStatusLabel[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Заметки для преподавателя</Label>
              <Textarea
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Внутренние заметки продажника</Label>
              <Textarea
                value={salesNotes}
                onChange={(e) => setSalesNotes(e.target.value)}
                rows={3}
              />
            </div>
            {trial ? (
              <div className="flex flex-wrap gap-2">
                <TrialAgreementBadge status={trial.agreementStatus} />
                <TrialLessonStatusBadge status={trial.lessonStatus} />
              </div>
            ) : null}
          </div>
          {cancelOpen ? (
            <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium">
                Слот в расписании освободится. История отмены сохранится.
              </p>
              <Label>Причина отмены</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Необязательно"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCancelOpen(false)}
                >
                  Назад
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void confirmCancel()}
                >
                  {busy ? "Отмена…" : "Подтвердить отмену"}
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter>
              {trial && trial.lessonStatus !== "cancelled" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setCancelOpen(true)}
                >
                  Отменить урок
                </Button>
              ) : null}
              <Button type="button" disabled={busy} onClick={() => void save()}>
                {busy ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
  );
}
