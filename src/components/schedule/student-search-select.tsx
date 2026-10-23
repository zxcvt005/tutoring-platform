"use client";

import { useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Student } from "@/lib/types";
import { cn } from "@/lib/utils";

export function filterStudentsByQuery(
  students: Student[],
  query: string
): Student[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return students.filter((s) => {
    if (s.status !== "active") return false;
    const name = s.fullName.toLowerCase();
    return name.includes(q);
  });
}

export function StudentSearchSelect({
  students,
  value,
  onChange,
  disabled,
}: {
  students: Student[];
  value: string;
  onChange: (studentId: string) => void;
  disabled?: boolean;
}) {
  const selected = students.find((s) => s.id === value);
  const selectedName = selected?.fullName ?? "";
  const [text, setText] = useState(selectedName);
  const [syncedName, setSyncedName] = useState(selectedName);
  if (selectedName !== syncedName) {
    setSyncedName(selectedName);
    setText(selectedName);
  }
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => filterStudentsByQuery(students, text),
    [students, text]
  );
  const showList = open && text.trim().length >= 2;

  function pick(student: Student) {
    onChange(student.id);
    setText(student.fullName);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={text}
        disabled={disabled}
        autoComplete="off"
        placeholder="Начните вводить имя или фамилию"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((i) =>
              Math.min(i + 1, Math.max(matches.length - 1, 0))
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = matches[highlight];
            if (picked) pick(picked);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-background py-1 shadow-md"
          role="listbox"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Ученики не найдены
            </li>
          ) : (
            matches.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  className={cn(
                    "flex w-full px-3 py-2 text-left text-sm",
                    i === highlight ? "bg-muted" : "hover:bg-muted/70"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                >
                  {s.fullName}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {text.trim().length > 0 && text.trim().length < 2 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Введите минимум 2 символа для поиска
        </p>
      ) : null}
    </div>
  );
}
