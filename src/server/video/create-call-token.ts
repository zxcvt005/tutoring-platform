import { AccessToken } from "livekit-server-sdk";

import { getLivekitConfig } from "@/server/video/livekit-config";

export async function mintCallLivekitToken(input: {
  roomName: string;
  identity: string;
  displayName: string;
}): Promise<{ serverUrl: string; participantToken: string }> {
  const config = getLivekitConfig();
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: input.identity,
    name: input.displayName.trim().slice(0, 80) || "Участник",
    ttl: "1h",
  });
  at.addGrant({
    room: input.roomName,
    roomJoin: true,
    roomCreate: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return {
    serverUrl: config.url,
    participantToken: await at.toJwt(),
  };
}
