import { AccessToken } from "livekit-server-sdk";

import { badRequest } from "@/server/errors";
import { getLivekitConfig } from "@/server/video/livekit-config";

const ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const IDENTITY_RE = /^[a-zA-Z0-9._-]{1,64}$/;

export type LabTokenInput = {
  roomName: string;
  identity: string;
  displayName: string;
};

export type LabTokenResult = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  identity: string;
};

function slugPart(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

/** Комнаты эксперимента всегда с префиксом lab-, чтобы не пересечься с будущими уроками. */
export function labRoomName(raw: string): string {
  const core = slugPart(raw, "two-party").replace(/^lab-/, "");
  const name = `lab-${core}`;
  if (!ROOM_RE.test(name)) {
    throw badRequest("Некорректное имя комнаты");
  }
  return name;
}

export function labIdentity(raw: string): string {
  const core = slugPart(raw, "guest").replace(/^lab-/, "");
  const identity = `lab-${core}`.slice(0, 64);
  if (!IDENTITY_RE.test(identity)) {
    throw badRequest("Некорректный идентификатор участника");
  }
  return identity;
}

export async function createLabLivekitToken(
  input: LabTokenInput
): Promise<LabTokenResult> {
  const config = getLivekitConfig();
  const roomName = labRoomName(input.roomName);
  const identity = labIdentity(input.identity);
  const displayName = input.displayName.trim().slice(0, 80) || "Участник";

  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: displayName,
    ttl: "15m",
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return {
    serverUrl: config.url,
    participantToken: await at.toJwt(),
    roomName,
    identity,
  };
}
