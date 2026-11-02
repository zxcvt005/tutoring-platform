/**
 * Преподаватель может войти в любую открытую (invited) комнату,
 * даже если ученик ещё не подключился. Закрытая комната недоступна.
 * Присутствие ученика на вход не влияет.
 */
export function canTeacherEnterRoom(input: {
  callStatus: string;
  mode: string;
  roomStatus: string;
  isActive: boolean;
  switching: boolean;
}): boolean {
  return (
    input.callStatus === "active" &&
    input.mode === "parallel" &&
    input.roomStatus === "invited" &&
    !input.isActive &&
    !input.switching
  );
}
