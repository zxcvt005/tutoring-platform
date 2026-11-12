const STORAGE_KEY = "direkciya-sidebar-collapsed";
const CHANGE_EVENT = "direkciya-sidebar-collapsed-change";

export function readDirekciyaSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDirekciyaSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

export function subscribeDirekciyaSidebarCollapsed(
  onStoreChange: () => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}
