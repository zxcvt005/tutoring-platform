/** Инвариант: публикация преподавателя только в одной комнате. Без SDK. */

export type PublishControls = {
  id: string;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  isMicrophoneEnabled: () => boolean;
  isCameraEnabled: () => boolean;
};

export function publishersOf(
  rooms: Array<{ id: string; mic: boolean; camera: boolean }>
): { mic: string[]; camera: string[] } {
  return {
    mic: rooms.filter((room) => room.mic).map((room) => room.id),
    camera: rooms.filter((room) => room.camera).map((room) => room.id),
  };
}

export function extraPublisherError(
  rooms: Array<{ id: string; mic: boolean; camera: boolean }>
): string | null {
  const { mic, camera } = publishersOf(rooms);
  if (mic.length > 1) {
    return `Микрофон публикуется сразу в комнатах: ${mic.join(", ")}`;
  }
  if (camera.length > 1) {
    return `Камера публикуется сразу в комнатах: ${camera.join(", ")}`;
  }
  const publishers = new Set([...mic, ...camera]);
  if (publishers.size > 1) {
    return `Публикация сразу в комнатах: ${[...publishers].join(", ")}`;
  }
  return null;
}

/** Глушит публикацию во всех комнатах и проверяет, что эфир нигде не остался. */
export async function muteAllPublishers(rooms: PublishControls[]): Promise<void> {
  for (const room of rooms) {
    await room.setMicrophoneEnabled(false);
    await room.setCameraEnabled(false);
  }
  for (const room of rooms) {
    if (room.isMicrophoneEnabled()) {
      throw new Error(
        `Микрофон в комнате ${room.id} не выключился. В новую комнату не переключаюсь.`
      );
    }
    if (room.isCameraEnabled()) {
      throw new Error(
        `Камера в комнате ${room.id} не выключилась. В новую комнату не переключаюсь.`
      );
    }
  }
}

/**
 * Сначала глушит публикацию во всех комнатах (включая целевую) и проверяет,
 * что микрофон и камера нигде не активны. Только после этого включает их
 * в целевой комнате. UI не должен помечаться переключённым, пока это
 * не завершилось без ошибки.
 */
export async function switchActivePublisher(
  rooms: PublishControls[],
  targetId: string,
  output: { microphone: boolean; camera: boolean }
): Promise<void> {
  const target = rooms.find((room) => room.id === targetId);
  if (!target) {
    throw new Error("Нет целевой комнаты для публикации");
  }

  await muteAllPublishers(rooms);

  if (output.microphone) {
    await target.setMicrophoneEnabled(true);
  }
  if (output.camera) {
    await target.setCameraEnabled(true);
  }
}
