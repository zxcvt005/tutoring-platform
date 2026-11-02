export const VIDEO_CALL_MODES = ["parallel", "group"] as const;
export type VideoCallMode = (typeof VIDEO_CALL_MODES)[number];

export const VIDEO_CALL_STATUSES = ["active", "ended"] as const;
export type VideoCallStatus = (typeof VIDEO_CALL_STATUSES)[number];

export const VIDEO_PARTICIPANT_STATUSES = ["invited", "closed"] as const;
export type VideoParticipantStatus = (typeof VIDEO_PARTICIPANT_STATUSES)[number];

export type VideoCallSummary = {
  id: string;
  mode: VideoCallMode;
  status: VideoCallStatus;
  createdAt: string;
  endedAt: string | null;
  teacherName: string;
  participantCount: number;
  /** Только для ученика: его комната, без чужих имён. */
  myStatus?: VideoParticipantStatus;
};

export type VideoCallParticipantView = {
  id: string;
  studentId: string;
  studentName: string;
  status: VideoParticipantStatus;
  isActive: boolean;
  /**
   * Личный приём: «ожидает», «в эфире», «переподключение».
   * В кабинете поля нет, подпись считается по эфиру и LiveKit.
   */
  presenceLabel?: string;
  /** Личный приём: момент входа гостя. */
  connectedAt?: string;
};

export type VideoGroupMemberView = {
  id: string;
  name: string;
  role: "teacher" | "student";
  status: VideoParticipantStatus | "active";
};

export type VideoCallTeacherView = {
  role: "teacher";
  id: string;
  mode: VideoCallMode;
  status: VideoCallStatus;
  createdAt: string;
  endedAt: string | null;
  activeParticipantId: string | null;
  teacherName: string;
  participants: VideoCallParticipantView[];
};

export type VideoCallStudentView = {
  role: "student";
  id: string;
  mode: VideoCallMode;
  status: VideoCallStatus;
  createdAt: string;
  endedAt: string | null;
  teacherName: string;
  myParticipantId: string;
  myStatus: VideoParticipantStatus;
  /** Параллельный режим: эфир идёт этому ученику. Чужих имён нет. */
  teacherWithMe: boolean;
  /** Только групповой режим. */
  members: VideoGroupMemberView[] | null;
};

export type VideoCallView = VideoCallTeacherView | VideoCallStudentView;

export type VideoInviteCandidate = {
  id: string;
  fullName: string;
  nextLessonAt: string | null;
};

export type VideoLivekitToken = {
  participantId: string | null;
  roomName: string;
  serverUrl: string;
  participantToken: string;
  identity: string;
};
