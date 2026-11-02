"use client";

import { createContext, useContext } from "react";

import type {
  StudentTourExtras,
  StudentTourTrainerResult,
} from "@/lib/student-tour/types";

export type StudentTourExtrasApi = {
  extras: StudentTourExtras;
  recordTrainerResult: (result: StudentTourTrainerResult) => void;
};

export const StudentTourExtrasContext =
  createContext<StudentTourExtrasApi | null>(null);

export function useStudentTourExtras() {
  const ctx = useContext(StudentTourExtrasContext);
  if (!ctx) {
    throw new Error(
      "useStudentTourExtras must be used within StudentTourProvider"
    );
  }
  return ctx;
}

export function useStudentTourExtrasOptional() {
  return useContext(StudentTourExtrasContext);
}
