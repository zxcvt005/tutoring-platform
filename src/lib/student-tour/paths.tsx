"use client";

import { createContext, useContext } from "react";

import { STUDENT_TOUR_BASE_PATH } from "@/lib/student-tour/constants";

type StudentTourPathValue = {
  active: boolean;
  basePath: string;
};

const StudentTourPathContext = createContext<StudentTourPathValue>({
  active: false,
  basePath: "/auditoria",
});

export function StudentTourPathProvider({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <StudentTourPathContext.Provider
      value={{
        active,
        basePath: active ? STUDENT_TOUR_BASE_PATH : "/auditoria",
      }}
    >
      {children}
    </StudentTourPathContext.Provider>
  );
}

export function useStudentTour() {
  return useContext(StudentTourPathContext);
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
