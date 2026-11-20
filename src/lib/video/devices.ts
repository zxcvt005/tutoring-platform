/**
 * Перечисление и переключение камеры/микрофона через LiveKit Room API.
 */

import { Room } from "livekit-client";

export type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

export async function listMediaDevices(
  kind: MediaDeviceKind
): Promise<MediaDeviceOption[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await Room.getLocalDevices(kind, true);
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label || `${kind === "audioinput" ? "Микрофон" : "Камера"} ${index + 1}`,
  }));
}

export async function switchCallDevice(
  rooms: Iterable<Room>,
  kind: "audioinput" | "videoinput",
  deviceId: string
): Promise<void> {
  let switched = false;
  let lastError: unknown;
  for (const room of rooms) {
    try {
      await room.switchActiveDevice(kind, deviceId);
      switched = true;
    } catch (err) {
      lastError = err;
    }
  }
  if (!switched && lastError) throw lastError;
}
