"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  GRAPHICS_TABLET_STATUS_LABEL,
  type GraphicsTabletRow,
  type GraphicsTabletStatus,
} from "@/lib/graphics-tablets";
import {
  apiPlatform,
  HttpStatusError,
  type PlatformApiCall,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

type Patch = Partial<
  Pick<GraphicsTabletRow, "trialCompleted" | "address" | "tabletStatus">
>;

const TEXT_DEBOUNCE_MS = 450;

export function GraphicsTabletsWorkspace({
  apiCall = apiPlatform,
}: {
  apiCall?: PlatformApiCall;
} = {}) {
  const [rows, setRows] = useState<GraphicsTabletRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const rowsRef = useRef(rows);
  const timersRef = useRef(new Map<string, number>());

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<{ rows: GraphicsTabletRow[] }>(
        "listGraphicsTablets",
        {}
      );
      setRows(data.rows);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить таблицу"
      );
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers.values()) window.clearTimeout(id);
      timers.clear();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.studentFullName.toLowerCase().includes(q));
  }, [query, rows]);

  function applyLocal(studentId: string, patch: Patch) {
    setRows((prev) => {
      const next = prev.map((r) =>
        r.studentId === studentId ? { ...r, ...patch } : r
      );
      rowsRef.current = next;
      return next;
    });
  }

  async function persist(studentId: string, patch: Patch) {
    const current =
      rowsRef.current.find((r) => r.studentId === studentId) ?? null;
    if (!current) return;

    setSaveState("saving");
    const payload = {
      studentId,
      expectedUpdatedAt: current.updatedAt,
      ...patch,
    };

    const run = async (expectedUpdatedAt: string | null) => {
      const data = await apiCall<{ row: GraphicsTabletRow }>(
        "updateGraphicsTablet",
        { ...payload, expectedUpdatedAt }
      );
      setRows((prev) =>
        prev.map((r) => (r.studentId === studentId ? data.row : r))
      );
      setSaveState("saved");
    };

    try {
      await run(current.updatedAt);
    } catch (e) {
      if (e instanceof HttpStatusError && e.status === 409) {
        try {
          const fresh = await apiCall<{ rows: GraphicsTabletRow[] }>(
            "listGraphicsTablets",
            {}
          );
          setRows(fresh.rows);
          const next =
            fresh.rows.find((r) => r.studentId === studentId) ?? null;
          await run(next?.updatedAt ?? null);
          return;
        } catch (retryErr) {
          setSaveState("error");
          toast.error(
            retryErr instanceof Error
              ? retryErr.message
              : "Конфликт сохранения"
          );
          return;
        }
      }
      setSaveState("error");
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
      await load();
    }
  }

  function queueSave(studentId: string, patch: Patch, immediate = false) {
    applyLocal(studentId, patch);
    const existing = timersRef.current.get(studentId);
    if (existing) window.clearTimeout(existing);
    if (immediate) {
      timersRef.current.delete(studentId);
      void persist(studentId, patch);
      return;
    }
    const timer = window.setTimeout(() => {
      timersRef.current.delete(studentId);
      const latest = rowsRef.current.find((r) => r.studentId === studentId);
      if (!latest) return;
      void persist(studentId, {
        trialCompleted: latest.trialCompleted,
        address: latest.address,
        tabletStatus: latest.tabletStatus,
      });
    }, TEXT_DEBOUNCE_MS);
    timersRef.current.set(studentId, timer);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Графические планшеты"
        description="Контроль пробных занятий и заказа графических планшетов. Список учеников синхронизируется с общей базой."
        actions={
          <span
            className={cn(
              "text-sm",
              saveState === "error"
                ? "text-destructive"
                : saveState === "saved"
                  ? "text-success"
                  : "text-muted-foreground"
            )}
          >
            {saveState === "saving"
              ? "Сохранение…"
              : saveState === "saved"
                ? "Сохранено"
                : saveState === "error"
                  ? "Ошибка сохранения"
                  : null}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени ученика"
          className="max-w-sm"
        />
        <p className="text-sm text-muted-foreground">
          {filtered.length} из {rows.length}
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Нет учеников"
          description={
            query.trim()
              ? "Попробуйте изменить поисковый запрос."
              : "Когда появятся ученики в школе, они отобразятся здесь автоматически."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <Table className="base-leads-table min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32%]">Ученик</TableHead>
                <TableHead className="w-[14%] text-center">
                  Прошёл пробный
                </TableHead>
                <TableHead className="w-[36%]">Адрес</TableHead>
                <TableHead className="w-[18%]">Планшет</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.studentId} className="align-middle">
                  <TableCell className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.studentFullName}</span>
                      <PersonStatusBadge status={row.studentStatus} />
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Checkbox
                      checked={row.trialCompleted}
                      onCheckedChange={(checked) =>
                        queueSave(
                          row.studentId,
                          { trialCompleted: Boolean(checked) },
                          true
                        )
                      }
                      aria-label={`Прошёл пробный · ${row.studentFullName}`}
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      value={row.address}
                      onChange={(e) =>
                        queueSave(row.studentId, { address: e.target.value })
                      }
                      placeholder="Адрес доставки"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <Select
                      value={row.tabletStatus}
                      onValueChange={(v) => {
                        if (!v) return;
                        queueSave(
                          row.studentId,
                          { tabletStatus: v as GraphicsTabletStatus },
                          true
                        );
                      }}
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue>
                          {(v) =>
                            GRAPHICS_TABLET_STATUS_LABEL[
                              v as GraphicsTabletStatus
                            ] ?? "Планшет"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_needed">
                          {GRAPHICS_TABLET_STATUS_LABEL.not_needed}
                        </SelectItem>
                        <SelectItem value="ordered">
                          {GRAPHICS_TABLET_STATUS_LABEL.ordered}
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
