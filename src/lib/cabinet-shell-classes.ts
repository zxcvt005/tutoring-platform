import { cn } from "@/lib/utils";

type SidebarRole =
  | "direkciya"
  | "kafedra"
  | "auditoria"
  | "pressa"
  | "assistent";

/** Карточка «Кабинет / название / переключатель ролей» только не у Аудитории. */
export function showSidebarCabinetChrome(role: SidebarRole) {
  return role !== "auditoria";
}

/**
 * Внешний слот сайдбара. У Аудитории он прозрачный и с внутренним
 * отступом 12px, чтобы вокруг панели был виден фон страницы.
 */
export function cabinetAsideClassName(role: SidebarRole) {
  return cn(
    "sticky hidden shrink-0 md:block",
    role === "auditoria"
      ? "top-0 z-10 h-svh self-start bg-transparent p-3"
      : "top-0 h-svh w-56 border-r border-sidebar-border bg-sidebar lg:w-[15rem]"
  );
}

/** Светлая скруглённая панель внутри прозрачного слота Аудитории. */
export function cabinetAsidePanelClassName(role: SidebarRole) {
  if (role !== "auditoria") return undefined;
  return "flex h-full w-56 min-h-0 flex-col overflow-hidden rounded-3xl border border-black/10 bg-auditoria-surface lg:w-[15rem]";
}

export function cabinetMobileSheetClassName(role: SidebarRole) {
  return role === "auditoria"
    ? "inset-y-3 left-3 h-auto max-h-[calc(100dvh-1.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border border-black/10 bg-auditoria-surface shadow-none"
    : undefined;
}
