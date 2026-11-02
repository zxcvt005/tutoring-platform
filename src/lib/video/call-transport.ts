import {
  apiVideoCallActivate,
  apiVideoCallCloseParticipant,
  apiVideoCallEnd,
  apiVideoCallGet,
  apiVideoCallHold,
  apiVideoCallTokens,
} from "@/lib/video/api";
import type { VideoCallView, VideoLivekitToken } from "@/lib/video/types";

export type TeacherCallTransport = {
  get: (id: string) => Promise<{ call: VideoCallView }>;
  tokens: (id: string) => Promise<{ tokens: VideoLivekitToken[] }>;
  activate: (
    id: string,
    participantId: string
  ) => Promise<{ call: VideoCallView }>;
  hold: (id: string) => Promise<{ call: VideoCallView }>;
  closeParticipant: (
    id: string,
    participantId: string
  ) => Promise<{ call: VideoCallView }>;
  end: (id: string) => Promise<{ call: VideoCallView }>;
};

export type StudentCallTransport = {
  get: (id: string) => Promise<{ call: VideoCallView }>;
  tokens: (id: string) => Promise<{ tokens: VideoLivekitToken[] }>;
};

export const cabinetTeacherTransport: TeacherCallTransport = {
  get: apiVideoCallGet,
  tokens: apiVideoCallTokens,
  activate: apiVideoCallActivate,
  hold: apiVideoCallHold,
  closeParticipant: apiVideoCallCloseParticipant,
  end: apiVideoCallEnd,
};

export const cabinetStudentTransport: StudentCallTransport = {
  get: apiVideoCallGet,
  tokens: apiVideoCallTokens,
};
