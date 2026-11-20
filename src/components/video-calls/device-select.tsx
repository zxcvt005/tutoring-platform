"use client";

import { useEffect, useState } from "react";

import {
  listMediaDevices,
  type MediaDeviceOption,
} from "@/lib/video/devices";
import { cn } from "@/lib/utils";

export function DeviceSelect({
  kind,
  value,
  disabled,
  onChange,
  className,
}: {
  kind: "audioinput" | "videoinput";
  value: string;
  disabled?: boolean;
  onChange: (deviceId: string) => void;
  className?: string;
}) {
  const [devices, setDevices] = useState<MediaDeviceOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await listMediaDevices(kind);
        if (!cancelled) setDevices(next);
      } catch {
        if (!cancelled) setDevices([]);
      }
    }
    void load();
    const onChangeDevices = () => void load();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChangeDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        onChangeDevices
      );
    };
  }, [kind]);

  if (devices.length <= 1) return null;

  return (
    <select
      className={cn(
        "max-w-[9.5rem] truncate rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground",
        className
      )}
      aria-label={kind === "audioinput" ? "Выбор микрофона" : "Выбор камеры"}
      disabled={disabled}
      value={value || devices[0]?.deviceId || ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {devices.map((device) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label}
        </option>
      ))}
    </select>
  );
}
