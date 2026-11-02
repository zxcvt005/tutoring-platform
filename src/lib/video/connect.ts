import {
  ConnectionState,
  Room,
  RoomEvent,
  type RoomConnectOptions,
  type RoomOptions,
} from "livekit-client";

/**
 * Не задаём iceServers сами: SDK подставит TURN/TLS текущего сервера.
 */
export function videoRoomOptions(): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
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

export async function ensureVideoRoomConnected(
  room: Room,
  serverUrl: string,
  token: string
): Promise<void> {
  if (room.state === ConnectionState.Connected) return;
  if (
    room.state === ConnectionState.Connecting ||
    room.state === ConnectionState.Reconnecting ||
    room.state === ConnectionState.SignalReconnecting
  ) {
    await waitUntilConnected(room);
    return;
  }
  await connectVideoRoom(room, serverUrl, token);
}

function waitUntilConnected(room: Room, timeoutMs = 20_000): Promise<void> {
  if (room.state === ConnectionState.Connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      room.off(RoomEvent.ConnectionStateChanged, onState);
      if (err) reject(err);
      else resolve();
    };
    const timer = globalThis.setTimeout(() => {
      finish(new Error("Комната ещё не подключена"));
    }, timeoutMs);
    const onState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) finish();
      if (state === ConnectionState.Disconnected) {
        finish(new Error("Комната ещё не подключена"));
      }
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);
    if (room.state === ConnectionState.Connected) finish();
  });
}
