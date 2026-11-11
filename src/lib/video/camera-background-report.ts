/**
 * On call UI mount: if the previous background enable left a crash breadcrumb,
 * surface it and optionally POST a tiny authenticated diagnostic payload.
 */

import { getCameraBackgroundDiag } from "@/lib/video/camera-background";
import {
  cameraBackgroundDiagToPayload,
  consumeCameraBackgroundCrashReport,
  summarizeCameraBackgroundCrash,
  type CameraBackgroundStageSnapshot,
} from "@/lib/video/camera-background-stages";

export type CameraBackgroundCrashNotice = {
  message: string;
  snapshot: CameraBackgroundStageSnapshot;
};

export function takeCameraBackgroundCrashNotice(): CameraBackgroundCrashNotice | null {
  const snapshot = consumeCameraBackgroundCrashReport();
  if (!snapshot) return null;
  return {
    message: summarizeCameraBackgroundCrash(snapshot),
    snapshot,
  };
}

export async function flushCameraBackgroundCrashReport(
  snapshot: CameraBackgroundStageSnapshot,
  postPlatform: (action: string, payload: unknown) => Promise<unknown>
): Promise<void> {
  const payload = cameraBackgroundDiagToPayload(
    getCameraBackgroundDiag(),
    snapshot
  );
  try {
    await postPlatform("reportCameraBackgroundDiag", {
      kind: "crash_breadcrumb",
      ...payload,
    });
  } catch {
    /* diagnostics must never break the call UI */
  }
}
