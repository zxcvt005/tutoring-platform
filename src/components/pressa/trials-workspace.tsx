"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { TrialDialog } from "@/components/pressa/trial-dialog";
import {
  TrialAgreementBadge,
  TrialLessonStatusBadge,
} from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatTime } from "@/lib/format";
import { apiPress, apiPressGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import {
  trialAgreementStatusLabel,
  trialLessonStatusLabel,
  type TrialAgreementStatus,
  type TrialLesson,
  type TrialLessonStatus,
} from "@/lib/trial-lessons";

export function PressTrialsWorkspace({
  initialTeacherId,
}: {
  initialTeacherId?: string;
}) {
  const { data, reload } = useDemoStore();
  const [teacherId, setTeacherId] = useState(initialTeacherId ?? "all");
  const [agreement, setAgreement] = useState<TrialAgreementStatus | "all">(
    "all"
  );
  const [status, setStatus] = useState<TrialLessonStatus | "all">("all");
  const [trials, setTrials] = useState<TrialLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrialLesson | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiPressGet<{ trials: TrialLesson[] }>("trials", {
        teacherId: teacherId === "all" ? undefined : teacherId,
        agreementStatus: agreement === "all" ? undefined : agreement,
        lessonStatus: status === "all" ? undefined : status,
      });
      setTrials(data.trials);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить пробные");
    } finally {
      setLoading(false);
    }
  }, [teacherId, agreement, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changeAgreement(trial: TrialLesson, value: TrialAgreementStatus) {
    try {
      await apiPress("updateTrial", { id: trial.id, agreementStatus: value });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сменить статус");
    }
  }

  return (
    <div>
      <PageHeader
        title="Пробные уроки"
        description="Пробный не создаёт аккаунт ученика, не списывает тариф и не оплачивается преподавателю."
        actions={
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Новый пробный
          </Button>
        }
      />
      <FilterBar>
        <Select
          value={teacherId}
          onValueChange={(v) => v && setTeacherId(v)}
        >
          <SelectTrigger className="w-[220px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Все преподаватели"
                  : data.teachers.find((t) => t.id === v)?.fullName ??
                    "Преподаватель"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все преподаватели</SelectItem>
            {data.teachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={agreement}
          onValueChange={(v) =>
            setAgreement((v as TrialAgreementStatus | "all") ?? "all")
          }
        >
          <SelectTrigger className="w-[200px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Любая договорённость"
                  : trialAgreementStatusLabel[v as TrialAgreementStatus]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любая договорённость</SelectItem>
            <SelectItem value="not_discussed">Не договаривались</SelectItem>
            <SelectItem value="agreed">Договорились</SelectItem>
            <SelectItem value="not_agreed">Не договорились</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) =>
            setStatus((v as TrialLessonStatus | "all") ?? "all")
          }
        >
          <SelectTrigger className="w-[180px] rounded-full">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Любой факт"
                  : trialLessonStatusLabel[v as TrialLessonStatus]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой факт</SelectItem>
            <SelectItem value="planned">Запланирован</SelectItem>
            <SelectItem value="completed">Проведён</SelectItem>
            <SelectItem value="cancelled">Отменён</SelectItem>
            <SelectItem value="no_show">Неявка</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : trials.length === 0 ? (
        <EmptyState
          title="Пробных уроков нет"
          description="Создайте пробный из этого раздела или из расписания преподавателя."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Когда</TableHead>
                <TableHead>Преподаватель</TableHead>
                <TableHead>Договорённость</TableHead>
                <TableHead>Факт</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trials.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/pressa/trials/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.prospectName}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDateTime(t.startsAt)}–{formatTime(t.endsAt)}
                  </TableCell>
                  <TableCell>{t.teacherName ?? t.teacherId}</TableCell>
                  <TableCell>
                    <Select
                      value={t.agreementStatus}
                      onValueChange={(v) =>
                        v &&
                        void changeAgreement(t, v as TrialAgreementStatus)
                      }
                    >
                      <SelectTrigger className="h-8 w-[170px] rounded-full">
                        <SelectValue>
                          {() => (
                            <TrialAgreementBadge status={t.agreementStatus} />
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_discussed">
                          Не договаривались
                        </SelectItem>
                        <SelectItem value="agreed">Договорились</SelectItem>
                        <SelectItem value="not_agreed">Не договорились</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <TrialLessonStatusBadge status={t.lessonStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TrialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trial={editing}
        prefill={{
          teacherId: teacherId !== "all" ? teacherId : undefined,
        }}
        onSaved={() => {
          void load();
          void reload();
        }}
      />
    </div>
  );
}
