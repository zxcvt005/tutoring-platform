"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import {
  THEORY_PREVIEW_GRADES,
  type TheoryPreviewGrade,
} from "@/lib/theory/grade-catalog-order";
import {
  studentTheoryMaterialChips,
  theoryPackageCountLabel,
} from "@/lib/theory/list";
import { buildGradeTheoryCatalogItems } from "@/lib/theory/student-catalog";
import { useDemoStore } from "@/lib/store/demo-store";
import type { TheoryAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

const chipTone = {
  video: "border-[#d3e6f4] bg-pastel-blue/80",
  test: "border-[#d5eadc] bg-pastel-mint",
  file: "border-[#eadcc8] bg-pastel-beige",
} as const;

export function TheoryPreviewWorkspace({
  initialGrade,
}: {
  initialGrade?: TheoryPreviewGrade;
}) {
  const { data, reorderTheoryCatalogForGrade } = useDemoStore();
  const [grade, setGrade] = useState<TheoryPreviewGrade>(
    initialGrade ?? "7"
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () =>
      buildGradeTheoryCatalogItems({
        theories: data.theories,
        folders: data.materialFolders,
        grade,
        catalogOrder: data.theoryCatalogOrder,
      }),
    [data.theories, data.materialFolders, data.theoryCatalogOrder, grade]
  );

  async function persistOrder(next: TheoryAssignment[]) {
    setBusy(true);
    try {
      const result = await reorderTheoryCatalogForGrade({
        grade,
        orderedMaterialIds: next.map((item) => item.materialId),
      });
      if (!result.ok) {
        toast.error(result.error ?? "Не удалось сохранить порядок");
        return;
      }
      toast.success(`Порядок ${grade} класса сохранён`);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId || busy) return;
    const from = items.findIndex((item) => item.materialId === dragId);
    const to = items.findIndex((item) => item.materialId === targetId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setDragId(null);
    void persistOrder(next);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Просмотр теории"
        description="Каталог школьной теории глазами ученика выбранного класса. Перетащите карточки, чтобы задать порядок."
      />

      <div className="flex flex-wrap gap-2">
        {THEORY_PREVIEW_GRADES.map((g) => (
          <Button
            key={g}
            type="button"
            size="sm"
            variant={grade === g ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setGrade(g)}
          >
            {g} класс
          </Button>
        ))}
      </div>

      <section className="auditoria-home-card flex flex-wrap items-center gap-3 py-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Теория {grade} класса
        </h2>
        <span className="rounded-full bg-pastel-blue px-2.5 py-1 text-sm text-foreground/80">
          {theoryPackageCountLabel(items.length)}
        </span>
      </section>

      {items.length === 0 ? (
        <EmptyState
          title="Теории пока нет"
          description={`В школьной базе нет опубликованной теории для ${grade} класса.`}
        />
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.materialId}
              draggable={!busy}
              onDragStart={() => setDragId(item.materialId)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(item.materialId)}
              className={cn(
                "cursor-grab active:cursor-grabbing",
                dragId === item.materialId && "opacity-60"
              )}
            >
              <PreviewTheoryCard item={item} grade={grade} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewTheoryCard({
  item,
  grade,
}: {
  item: TheoryAssignment;
  grade: string;
}) {
  const chips = studentTheoryMaterialChips({
    videoUrl: item.videoUrl,
    hasTest: item.hasTest,
    files: item.files,
    questionCount: null,
  });

  return (
    <div className="auditoria-home-card flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Перетащите · {grade} класс</p>
        <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          {item.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Доступно по классу · обновлено {formatDate(item.assignedAt)}
        </p>
        {item.description ? (
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">
            {item.description}
          </p>
        ) : null}
      </div>
      {chips.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-2 lg:flex-1">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className={cn(
                "w-full rounded-2xl border px-3 py-2.5 sm:w-auto sm:min-w-40",
                chipTone[chip.tone]
              )}
            >
              <p className="font-medium">{chip.title}</p>
              {chip.detail ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {chip.detail}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-[#3f6b52]">Доступно</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        <Link
          href={`/assistent/knowledge/theory/${item.materialId}`}
          className="inline-flex h-11 items-center justify-center rounded-full bg-pastel-blue px-4 text-sm text-foreground"
        >
          Открыть материалы →
        </Link>
      </div>
    </div>
  );
}
