import {
  ConnectionState,
  Room,
  type RoomConnectOptions,
  type RoomOptions,
} from "livekit-client";

import {
  DEFAULT_CALL_AUDIO_CONSTRAINTS,
  buildAudioCaptureDefaults,
} from "@/lib/video/noise-suppression";
import {
  isConnectedState,
  isTransientConnectionState,
  waitForRoomSettled,
} from "@/lib/video/room-lifecycle";

/**
 * Не задаём iceServers сами: SDK подставит TURN/TLS текущего сервера.
 */
export function videoRoomOptions(
  noiseSuppressionEnabled: boolean = DEFAULT_CALL_AUDIO_CONSTRAINTS.noiseSuppression
): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    audioCaptureDefaults: buildAudioCaptureDefaults(noiseSuppressionEnabled),
  };
}

export function videoConnectOptions(): RoomConnectOptions {
  return {
    autoSubscribe: true,
    peerConnectionTimeout: 20_000,
    websocketTimeout: 15_000,
    maxRetries: 2,
  };
}

export function createVideoRoom(): Room {
  return new Room(videoRoomOptions());
}

export async function connectVideoRoom(
  room: Room,
  serverUrl: string,
  token: string
): Promise<void> {
  await room.connect(serverUrl, token, videoConnectOptions());
}

/**
 * Дожидается Connected. На transient-состояниях не вызывает disconnect —
 * ждёт SDK с таймаутом. При Disconnected/timeout бросает ошибку
 * (вызывающий код может пересоздать Room).
 */
export async function ensureVideoRoomConnected(
  room: Room,
  serverUrl: string,
  token: string,
  settleTimeoutMs = 12_000
): Promise<void> {
  if (isConnectedState(room.state)) return;
  if (isTransientConnectionState(room.state)) {
    const settled = await waitForRoomSettled(room, settleTimeoutMs);
    if (settled === "connected") return;
    throw new Error(
      settled === "timeout"
        ? "Восстановление сигнализации не завершилось вовремя"
        : "Комната отключилась во время восстановления"
    );
  }
  if (room.state === ConnectionState.Disconnected) {
    await connectVideoRoom(room, serverUrl, token);
    return;
  }
  await connectVideoRoom(room, serverUrl, token);
}
