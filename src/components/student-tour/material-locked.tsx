"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import { cn } from "@/lib/utils";

export function StudentTourMaterialLocked({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const href = useStudentCabinetHref();

  return (
    <section className="auditoria-home-card mx-auto max-w-2xl px-5 py-8 text-center sm:px-8 sm:py-10">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Демонстрационный режим
      </p>
      <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {description ??
          "Эти материалы и ответы доступны ученикам после подключения к обучению. В демо можно изучить остальные разделы кабинета."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={href("/")} className={cn(buttonVariants(), "rounded-xl")}>
          К главной демо
        </Link>
        <Link
          href="/#apply"
          className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}
        >
          Записаться на обучение
        </Link>
      </div>
    </section>
  );
}
