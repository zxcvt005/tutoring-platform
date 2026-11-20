/**
 * В параллельном режиме преподаватель держит только одну LiveKit-комнату:
 * активную. Остальные ученики ждут в своих комнатах без лишних
 * WebSocket/ICE у преподавателя (иначе ping timeout и one-way media).
 */
export function parallelWantedRoomIds(
  activeParticipantId: string | null | undefined
): string[] {
  return activeParticipantId ? [activeParticipantId] : [];
}
