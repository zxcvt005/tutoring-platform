"use client";

import { useState } from "react";
import { ConnectionCheck, CheckStatus } from "livekit-client";

import { Button } from "@/components/ui/button";
import { fetchLabToken, randomSuffix } from "@/components/dev/video-lab-shared";
import { labDiag, redactLabText } from "@/lib/video-lab/lab-diag";

type CheckRow = {
  name: string;
  description: string;
  status: string;
  meaning: string;
  detail: string;
};

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case CheckStatus.SUCCESS:
      return "ok";
    case CheckStatus.FAILED:
      return "fail";
    case CheckStatus.SKIPPED:
      return "skip";
    case CheckStatus.RUNNING:
      return "running";
    default:
      return "idle";
  }
}

function checkMeaning(name: string): string {
  switch (name) {
    case "WebSocketCheck":
      return "Сигнализация WSS. Это не медиа.";
    case "WebRTCCheck":
      return "Join + ICE без публикации камеры/мика.";
    case "TURNCheck":
      return "Join с iceTransportPolicy=relay. Успех ≠ TURN/TLS :443.";
    case "PublishAudioCheck":
      return "Реальная публикация микрофона и исходящие RTP-пакеты.";
    case "PublishVideoCheck":
      return "Реальная публикация камеры и исходящие RTP-пакеты.";
    case "ConnectionProtocolCheck":
      return "Вспомогательное сравнение force-udp vs force-tcp через simulateScenario, не путь обычного звонка.";
    default:
      return "Проверка ConnectionCheck SDK.";
  }
}

/**
 * Встроенный ConnectionCheck LiveKit. Не подставляет свои TURN-серверы
 * и не меняет комнаты A/B.
 */
export function VideoLabNetworkCheck() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setRows([]);
    try {
      const token = await fetchLabToken({
        roomName: "netcheck",
        identity: `netcheck-${randomSuffix()}`,
        displayName: "NetCheck",
      });
      labDiag({
        slot: "unknown",
        active: null,
        phase: "netcheck-start",
        message: "websocket+webrtc+turn+publish+protocol",
      });
      const checker = new ConnectionCheck(token.serverUrl, token.participantToken);
      const results = [
        await checker.checkWebsocket(),
        await checker.checkWebRTC(),
        await checker.checkTURN(),
        await checker.checkPublishAudio(),
        await checker.checkPublishVideo(),
        await checker.checkConnectionProtocol(),
      ];
      const mapped = results.map((info) => ({
        name: info.name,
        description: info.description,
        status: statusLabel(info.status),
        meaning: checkMeaning(info.name),
        detail: redactLabText(
          info.logs
            .map((log) => `${log.level === "error" ? "err: " : ""}${log.message}`)
            .join("; ")
        ).slice(0, 280),
      }));
      setRows(mapped);
      labDiag({
        slot: "unknown",
        active: null,
        phase: "netcheck-done",
        message: mapped
          .map((row) => `${row.name}:${row.status}`)
          .join(","),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось выполнить проверку сети";
      setError(redactLabText(message));
      labDiag({
        slot: "unknown",
        active: null,
        phase: "netcheck-error",
        message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Диагностика сети LiveKit</p>
          <p className="text-xs text-muted-foreground">
            Сначала сигнализация и ICE, затем публикация аудио/видео — это ближе
            к реальному звонку. «UDP vs TCP» — отдельный тест сравнения протоколов
            (~20 с), его отказ сам по себе не доказывает, что join сломан.
            Запустите без VPN и с VPN на одном устройстве. IP и токены скрыты.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? "Проверка…" : "Проверить сеть"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2 text-xs">
          {rows.map((row) => (
            <li
              key={row.name}
              className="rounded-xl border border-border/60 bg-card px-3 py-2"
            >
              <p className="font-medium">
                {row.description} · {row.status}
              </p>
              <p className="mt-1 text-muted-foreground">{row.meaning}</p>
              {row.detail ? (
                <p className="mt-1 text-muted-foreground">{row.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
