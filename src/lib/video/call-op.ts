/** Игнорировать устаревший poll, если преподаватель уже переключил комнату. */
export function isCurrentCallOp(started: number, current: number, switching: boolean) {
  return started === current && !switching;
}

export function teacherStageKey(view: {
  mode: string;
  activeParticipantId: string | null;
}) {
  if (view.mode === "group") return "group";
  return view.activeParticipantId ?? "hold";
}
