"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const COMPACT_CLASS =
  "min-h-7 max-h-14 overflow-y-hidden overflow-x-hidden whitespace-pre-wrap break-words [field-sizing:fixed]";
const OPEN_CLASS =
  "min-h-7 max-h-[min(40vh,20rem)] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words field-sizing-content";

/**
 * Компактное многострочное поле для таблиц Дирекции.
 * В свёрнутой строке — до двух строк с обрезкой; при фокусе или
 * раскрытой строке растёт по содержимому без горизонтальной прокрутки.
 */
export function InlineMultilineCell({
  value,
  placeholder,
  expanded,
  readOnly = false,
  className,
  onChange,
  onBlur,
  onFocusRow,
}: {
  value: string;
  placeholder?: string;
  /** Строка таблицы раскрыта пользователем */
  expanded: boolean;
  readOnly?: boolean;
  className?: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  /** При фокусе раскрыть строку (не терять длинный текст при вводе) */
  onFocusRow?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const open = expanded || focused;

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
  }, [value, open]);

  if (readOnly) {
    return (
      <span
        className={cn(
          "block w-full whitespace-pre-wrap break-words text-[0.78rem] text-foreground/85",
          expanded ? null : "line-clamp-2",
          className
        )}
      >
        {value || "—"}
      </span>
    );
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange?.(e.target.value);
  }

  function handleFocus(e: FocusEvent<HTMLTextAreaElement>) {
    setFocused(true);
    onFocusRow?.();
    e.stopPropagation();
  }

  function handleBlur(e: FocusEvent<HTMLTextAreaElement>) {
    setFocused(false);
    onBlur?.(e.target.value);
  }

  function handleClick(e: MouseEvent<HTMLTextAreaElement>) {
    e.stopPropagation();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  return (
    <Textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      rows={1}
      className={cn(
        "w-full rounded-lg border-transparent bg-transparent px-1 py-1 text-[0.78rem] leading-snug shadow-none transition-[height] duration-150 md:text-[0.78rem]",
        "focus-visible:border-input focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/40",
        open ? OPEN_CLASS : COMPACT_CLASS,
        className
      )}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    />
  );
}
