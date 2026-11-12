"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useParams, usePathname } from "next/navigation";

import { STUDENT_TOUR_BASE_PATH } from "@/lib/student-tour/constants";

export type StudentTourMode = "page" | "embedded";

type StudentTourPathValue = {
  active: boolean;
  mode: StudentTourMode;
  basePath: string;
  /** Виртуальный pathname в embedded; на page совпадает с URL. */
  pathname: string;
  params: Record<string, string>;
  navigate: (href: string) => void;
};

const defaultNavigate = (href: string) => {
  if (typeof window !== "undefined") window.location.assign(href);
};

const StudentTourPathContext = createContext<StudentTourPathValue>({
  active: false,
  mode: "page",
  basePath: "/auditoria",
  pathname: "/auditoria",
  params: {},
  navigate: defaultNavigate,
});

function parseTourParams(
  pathname: string,
  basePath: string
): Record<string, string> {
  const suffix = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  const homework = suffix.match(/^\/homework\/([^/]+)/);
  if (homework?.[1]) return { id: decodeURIComponent(homework[1]) };
  const theory = suffix.match(/^\/theory\/([^/]+)/);
  if (theory?.[1]) return { id: decodeURIComponent(theory[1]) };
  const history = suffix.match(/^\/history\/([^/]+)/);
  if (history?.[1]) return { id: decodeURIComponent(history[1]) };
  const calls = suffix.match(/^\/calls\/([^/]+)/);
  if (calls?.[1]) return { id: decodeURIComponent(calls[1]) };
  const intensive = suffix.match(/^\/intensivy\/([^/]+)/);
  if (intensive?.[1]) return { id: decodeURIComponent(intensive[1]) };
  return {};
}

export function StudentTourPathProvider({
  children,
  active,
  mode = "page",
  pathname: embeddedPathname,
  navigate: embeddedNavigate,
}: {
  children: ReactNode;
  active: boolean;
  mode?: StudentTourMode;
  pathname?: string;
  navigate?: (href: string) => void;
}) {
  const nextPathname = usePathname();
  const nextParams = useParams();

  const basePath = active ? STUDENT_TOUR_BASE_PATH : "/auditoria";
  const isEmbedded = active && mode === "embedded";

  const pathname = isEmbedded
    ? embeddedPathname || basePath
    : active
      ? nextPathname || basePath
      : nextPathname || "/auditoria";

  const params = useMemo(() => {
    if (isEmbedded) {
      return parseTourParams(pathname, basePath);
    }
    const raw = nextParams ?? {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") out[key] = value;
      else if (Array.isArray(value) && value[0]) out[key] = value[0];
    }
    return out;
  }, [basePath, isEmbedded, nextParams, pathname]);

  const navigate = useCallback(
    (href: string) => {
      if (isEmbedded && embeddedNavigate) {
        embeddedNavigate(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    },
    [embeddedNavigate, isEmbedded]
  );

  const value = useMemo<StudentTourPathValue>(
    () => ({
      active,
      mode: isEmbedded ? "embedded" : "page",
      basePath,
      pathname,
      params,
      navigate,
    }),
    [active, basePath, isEmbedded, navigate, params, pathname]
  );

  return (
    <StudentTourPathContext.Provider value={value}>
      {children}
    </StudentTourPathContext.Provider>
  );
}

export function useStudentTour() {
  return useContext(StudentTourPathContext);
}

/** Pathname кабинета: URL или виртуальный путь embedded-демо. */
export function useStudentTourPathname() {
  const tour = useStudentTour();
  const nextPathname = usePathname();
  if (tour.active) return tour.pathname;
  return nextPathname;
}

/** Params кабинета (в т.ч. id задания в embedded). */
export function useStudentTourParams<T extends Record<string, string>>() {
  const tour = useStudentTour();
  const nextParams = useParams();
  if (tour.mode === "embedded") return tour.params as T;
  return (nextParams ?? {}) as T;
}

/** Превращает путь Аудитории или относительный суффикс в актуальный href. */
export function useStudentCabinetHref() {
  const { basePath } = useStudentTour();
  return (path: string) => {
    if (path.startsWith("/auditoria")) {
      return `${basePath}${path.slice("/auditoria".length)}` || basePath;
    }
    if (path.startsWith(STUDENT_TOUR_BASE_PATH)) return path;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${basePath}${suffix}`;
  };
}
