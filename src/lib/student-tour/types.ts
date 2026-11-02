export type StudentTourCallStatus = "ended" | "missed" | "cancelled";

export type StudentTourCall = {
  id: string;
  createdAt: string;
  endedAt: string | null;
  durationMin: number | null;
  topic: string;
  teacherName: string;
  status: StudentTourCallStatus;
  note?: string;
};

export type StudentTourNotification = {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  kind: "homework" | "theory" | "lesson" | "exam" | "system";
};

export type StudentTourTrainerResult = {
  id: string;
  finishedAt: string;
  sectionId: string;
  sectionTitle: string;
  topicId: string;
  topicTitle: string;
  difficulty: "easy" | "medium" | "hard";
  total: number;
  correct: number;
  durationSec: number;
};

export type StudentTourExtras = {
  calls: StudentTourCall[];
  notifications: StudentTourNotification[];
  trainerHistory: StudentTourTrainerResult[];
};
