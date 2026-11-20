/**
 * Жизненный цикл LiveKit Room для параллельных звонков преподавателя.
 * Без токенов и полных URL в логах.
 */

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";

export type RoomDiagFields = {
  callId?: string;
  slotId?: string;
  activeId?: string | null;
  reason?: string;
  roomState?: string;
  roomName?: string;
  identity?: string;
  instance?: string;
};

let instanceSeq = 0;
const roomInstances = new WeakMap<Room, string>();

export function tagRoomInstance(room: Room): string {
  const existing = roomInstances.get(room);
  if (existing) return existing;
  instanceSeq += 1;
  const id = `rk${instanceSeq}`;
  roomInstances.set(room, id);
  return id;
}

export function roomInstanceTag(room: Room | null | undefined): string | undefined {
  if (!room) return undefined;
  return roomInstances.get(room) ?? tagRoomInstance(room);
}

/** Диагностика в консоль браузера — без access_token / JWT. */
export function logRoomDiag(
  event: string,
  fields: RoomDiagFields & Record<string, unknown> = {}
): void {
  const {
    callId,
    slotId,
    activeId,
    reason,
    roomState,
    roomName,
    identity,
    instance,
    ...rest
  } = fields;
  console.info("[video-room]", {
    t: Date.now(),
    event,
    callId,
    slotId,
    activeId: activeId ?? undefined,
    reason,
    roomState,
    roomName,
    identity,
    instance,
    ...rest,
  });
}

export function isTransientConnectionState(state: ConnectionState): boolean {
  return (
    state === ConnectionState.Connecting ||
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting
  );
}

export function isConnectedState(state: ConnectionState): boolean {
  return state === ConnectionState.Connected;
}

export function isDisconnectedState(state: ConnectionState): boolean {
  return state === ConnectionState.Disconnected;
}

/**
 * Ждёт Connected или окончательный Disconnected.
 * Не abort'ит reconnect — только наблюдает.
 */
export async function waitForRoomSettled(
  room: Room,
  timeoutMs = 12_000
): Promise<"connected" | "disconnected" | "timeout"> {
  if (isConnectedState(room.state)) return "connected";
  if (isDisconnectedState(room.state)) return "disconnected";

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: "connected" | "disconnected" | "timeout") => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      room.off(RoomEvent.ConnectionStateChanged, onState);
      resolve(result);
    };
    const timer = globalThis.setTimeout(() => finish("timeout"), timeoutMs);
    const onState = (state: ConnectionState) => {
      if (isConnectedState(state)) finish("connected");
      else if (isDisconnectedState(state)) finish("disconnected");
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);
    if (isConnectedState(room.state)) finish("connected");
    else if (isDisconnectedState(room.state)) finish("disconnected");
  });
}

async function muteLocalPublications(room: Room): Promise<void> {
  try {
    await room.localParticipant.setMicrophoneEnabled(false);
  } catch {
    /* ignore */
  }
  try {
    await room.localParticipant.setCameraEnabled(false);
  } catch {
    /* ignore */
  }
  for (const pub of room.localParticipant.trackPublications.values()) {
    const track = pub.track;
    if (!track) continue;
    try {
      track.detach();
    } catch {
      /* ignore */
    }
    if (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone) {
      try {
        await track.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Корректное отключение: сначала отпускаем локальные треки, затем disconnect.
 * Использовать только когда reconnect уже не идёт или ожидание истекло.
 */
export async function disconnectRoomCleanly(
  room: Room,
  reason: string,
  fields: RoomDiagFields = {}
): Promise<void> {
  const instance = tagRoomInstance(room);
  logRoomDiag("disconnect_begin", {
    ...fields,
    reason,
    instance,
    roomState: room.state,
    roomName: room.name || undefined,
    identity: room.localParticipant?.identity || undefined,
    initiator: "app",
  });
  await muteLocalPublications(room);
  try {
    await room.disconnect(true);
  } catch {
    /* уже закрыта */
  }
  try {
    room.removeAllListeners();
  } catch {
    /* ignore */
  }
  logRoomDiag("disconnect_done", {
    ...fields,
    reason,
    instance,
    roomState: room.state,
    initiator: "app",
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

/** После stop preview / disconnect даём устройству освободиться. */
export async function waitForLocalDevicesIdle(ms = 120): Promise<void> {
  await sleep(ms);
}

/**
 * Нужно ли выбросить Room из map и создать заново при sync.
 * Transient — нет (ждём SDK). Disconnected — да.
 */
export function roomNeedsRecreate(room: Room): boolean {
  return isDisconnectedState(room.state);
}
