"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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
import {
  SITE_LEAD_STATUSES,
  SITE_LEAD_STATUS_STYLES,
  gradeLabel,
  type SiteLead,
  type SiteLeadStatus,
} from "@/lib/site-leads";
import { apiPlatform, HttpStatusError } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: SiteLeadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-none",
        SITE_LEAD_STATUS_STYLES[status]
      )}
    >
      {status}
    </span>
  );
}

export function SiteLeadsWorkspace() {
  const [rows, setRows] = useState<SiteLead[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiPlatform<{ leads: SiteLead[] }>("listSiteLeads");
      startTransition(() => {
        setRows(data.leads);
        setReady(true);
      });
    } catch (err) {
      setLoadError(
        err instanceof HttpStatusError
          ? err.message
          : "Не удалось загрузить заявки"
      );
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial table load
    void reload();
  }, [reload]);

  async function onStatusChange(lead: SiteLead, status: SiteLeadStatus) {
    if (lead.status === status) return;
    setBusyId(lead.id);
    try {
      const data = await apiPlatform<{ lead: SiteLead }>(
        "updateSiteLeadStatus",
        {
          id: lead.id,
          status,
          updatedAt: lead.updatedAt,
        }
      );
      setRows((prev) =>
        prev.map((row) => (row.id === lead.id ? data.lead : row))
      );
    } catch (err) {
      toast.error(
        err instanceof HttpStatusError
          ? err.message
          : "Не удалось обновить статус"
      );
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(lead: SiteLead) {
    if (!window.confirm(`Удалить заявку «${lead.studentName}»?`)) return;
    setBusyId(lead.id);
    try {
      await apiPlatform("deleteSiteLead", { id: lead.id });
      setRows((prev) => prev.filter((row) => row.id !== lead.id));
      toast.success("Заявка удалена");
    } catch (err) {
      toast.error(
        err instanceof HttpStatusError
          ? err.message
          : "Не удалось удалить заявку"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Заявки"
        description="Обращения с сайта на диагностику. Появляются здесь сразу после отправки формы."
        actions={
          <Button type="button" variant="outline" onClick={() => void reload()}>
            Обновить
          </Button>
        }
      />

      {!ready ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : loadError ? (
        <EmptyState title="Не удалось загрузить" description={loadError} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Пока пусто"
          description="Как только кто-то оставит заявку на лендинге, она появится в этой таблице."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда</TableHead>
                <TableHead>Ученик</TableHead>
                <TableHead>Класс</TableHead>
                <TableHead>Уровень</TableHead>
                <TableHead>Родитель</TableHead>
                <TableHead>Контакт</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatWhen(lead.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">{lead.studentName}</TableCell>
                  <TableCell>{gradeLabel(lead.grade)}</TableCell>
                  <TableCell className="max-w-[10rem] truncate text-sm text-muted-foreground">
                    {lead.level || "—"}
                  </TableCell>
                  <TableCell>{lead.parentName}</TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    {lead.contact}
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm text-muted-foreground">
                    {lead.comment || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[9rem] flex-col gap-1.5">
                      <StatusPill status={lead.status} />
                      <Select
                        value={lead.status}
                        disabled={busyId === lead.id}
                        onValueChange={(value) => {
                          if (!value) return;
                          void onStatusChange(lead, value as SiteLeadStatus);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SITE_LEAD_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busyId === lead.id}
                      aria-label="Удалить заявку"
                      onClick={() => void onDelete(lead)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
