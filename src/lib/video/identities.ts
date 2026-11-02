const ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const IDENTITY_RE = /^[a-zA-Z0-9._-]{1,64}$/;

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
}

export function teacherLivekitIdentity(teacherId: string): string {
  const identity = `t-${slug(teacherId)}`.slice(0, 64);
  if (!IDENTITY_RE.test(identity)) {
    throw new Error("Некорректный идентификатор преподавателя");
  }
  return identity;
}

export function studentLivekitIdentity(studentId: string): string {
  const identity = `s-${slug(studentId)}`.slice(0, 64);
  if (!IDENTITY_RE.test(identity)) {
    throw new Error("Некорректный идентификатор ученика");
  }
  return identity;
}

export function parallelLivekitRoomName(
  callId: string,
  participantId: string
): string {
  const name = `vc-${slug(callId)}-${slug(participantId)}`.slice(0, 64);
  if (!ROOM_RE.test(name)) {
    throw new Error("Некорректное имя комнаты");
  }
  return name;
}

export function groupLivekitRoomName(callId: string): string {
  const name = `vcg-${slug(callId)}`.slice(0, 64);
  if (!ROOM_RE.test(name)) {
    throw new Error("Некорректное имя комнаты");
  }
  return name;
}
