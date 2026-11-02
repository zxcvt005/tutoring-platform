import { RoomServiceClient } from "livekit-server-sdk";

import { getLivekitConfig } from "@/server/video/livekit-config";

export type VideoLivekitSync = {
  ensureRoom: (
    roomName: string,
    maxParticipants: number,
    emptyTimeoutSeconds?: number
  ) => Promise<void>;
  deleteRoom: (roomName: string) => Promise<void>;
  removeParticipant: (roomName: string, identity: string) => Promise<void>;
};

function httpUrl(wsUrl: string): string {
  if (wsUrl.startsWith("wss:")) return `https:${wsUrl.slice(4)}`;
  if (wsUrl.startsWith("ws:")) return `http:${wsUrl.slice(3)}`;
  return wsUrl;
}

function roomService(): RoomServiceClient {
  const config = getLivekitConfig();
  return new RoomServiceClient(
    httpUrl(config.url),
    config.apiKey,
    config.apiSecret
  );
}

const realSync: VideoLivekitSync = {
  async ensureRoom(roomName, maxParticipants, emptyTimeoutSeconds = 6 * 60 * 60) {
    try {
      await roomService().createRoom({
        name: roomName,
        emptyTimeout: emptyTimeoutSeconds,
        maxParticipants,
      });
    } catch {
      // Комната уже существует — это нормально при повторном приглашении/рестарте.
    }
  },
  async deleteRoom(roomName) {
    try {
      await roomService().deleteRoom(roomName);
    } catch {
      // Уже удалена или недоступна — источник истины в БД.
    }
  },
  async removeParticipant(roomName, identity) {
    try {
      await roomService().removeParticipant(roomName, identity);
    } catch {
      // Участника уже нет в комнате.
    }
  },
};

let sync: VideoLivekitSync = realSync;

export function setVideoLivekitSyncForTests(next: VideoLivekitSync | null) {
  sync = next ?? realSync;
}

export function videoLivekitSync(): VideoLivekitSync {
  return sync;
}
