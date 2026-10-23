"use client";

import { useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TopicSuggestField({
  topics,
  value,
  onCommit,
  disabled,
  hint,
  label = "Тема занятия",
  inputId,
  excludeTopicIds,
  excludeTitles,
}: {
  topics: Topic[];
  value: string;
  onCommit: (title: string, topicId: string | null) => void;
  disabled?: boolean;
  hint?: string | null;
  label?: string;
  inputId?: string;
  excludeTopicIds?: Set<string>;
  excludeTitles?: Set<string>;
}) {
  const [text, setText] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value);
  }
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipBlurCommit = useRef(false);
  const fieldId = inputId ?? "lesson-topic-suggest";

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = topics.filter((t) => {
      if (t.status !== "active") return false;
      if (excludeTopicIds?.has(t.id)) return false;
      if (excludeTitles?.has(t.title.trim().toLowerCase())) return false;
      return true;
    });
    if (!q) return list.slice(0, 8);
    return list
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [text, topics, excludeTopicIds, excludeTitles]);

  function commit(next: string, topicId: string | null) {
    const trimmed = next.trim();
    setText(trimmed);
    setOpen(false);
    onCommit(trimmed, topicId);
  }

  function pick(topic: Topic) {
    skipBlurCommit.current = true;
    commit(topic.title, topic.id);
  }

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      {label ? (
        <Label htmlFor={fieldId} className="text-xs">
          {label}
        </Label>
      ) : null}
      <Input
        id={fieldId}
        value={text}
        disabled={disabled}
        autoComplete="off"
        placeholder="Начните вводить название"
        className={cn(label ? "mt-1" : "")}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            setOpen(false);
            if (text.trim() !== value.trim()) {
              const exact = topics.find(
                (t) =>
                  t.status === "active" &&
                  t.title.toLowerCase() === text.trim().toLowerCase()
              );
              commit(text, exact?.id ?? null);
            }
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((i) =>
              Math.min(i + 1, Math.max(suggestions.length - 1, 0))
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = suggestions[highlight];
            if (open && picked) pick(picked);
            else {
              const exact = topics.find(
                (t) =>
                  t.status === "active" &&
                  t.title.toLowerCase() === text.trim().toLowerCase()
              );
              commit(text, exact?.id ?? null);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul
          className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-background py-1 shadow-md"
          role="listbox"
        >
          {suggestions.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm",
                  i === highlight ? "bg-muted" : "hover:bg-muted/70"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t)}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hint === null ? null : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Подсказка из каталога не создаёт новую тему. Новую формулировку можно
          ввести как есть.
        </p>
      )}
    </div>
  );
}
