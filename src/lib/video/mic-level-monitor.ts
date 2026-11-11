/**
 * Локальный индикатор уровня микрофона через Web Audio AnalyserNode.
 * Не публикует звук и не создаёт петлю обратной связи.
 */

export type MicLevelMonitor = {
  /** 0..1 сглаженный уровень */
  getLevel: () => number;
  stop: () => void;
};

export function createMicLevelMonitor(
  mediaStream: MediaStream | null | undefined
): MicLevelMonitor | null {
  if (typeof window === "undefined" || !mediaStream) return null;
  const audioTracks = mediaStream.getAudioTracks().filter((t) => t.readyState === "live");
  if (!audioTracks.length) return null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  const stream = new MediaStream(audioTracks.map((t) => t.clone()));
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);
  // Не подключаем к destination — иначе будет эхо в динамиках.

  const data = new Uint8Array(analyser.frequencyBinCount);
  let smoothed = 0;
  let stopped = false;

  function getLevel() {
    if (stopped) return 0;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    smoothed = smoothed * 0.75 + Math.min(1, rms * 3.2) * 0.25;
    return smoothed;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    try {
      analyser.disconnect();
    } catch {
      /* ignore */
    }
    for (const track of stream.getTracks()) track.stop();
    void ctx.close().catch(() => undefined);
  }

  return { getLevel, stop };
}
