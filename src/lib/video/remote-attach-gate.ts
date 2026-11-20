/**
 * Гарантирует attach удалённых треков после появления DOM.
 * Ранний TrackSubscribed / activate до mount → pending → flush на mount.
 */

export type RemoteAttachResult =
  | "attached"
  | "pending"
  | "skipped_duplicate"
  | "idle";

export function hasUsableRemoteElements(
  videos: Array<HTMLVideoElement | null | undefined>,
  audios: Array<HTMLAudioElement | null | undefined>
): boolean {
  return videos.some(Boolean) || audios.some(Boolean);
}

function primaryEl<T>(els: Array<T | null | undefined>): T | null {
  for (const el of els) {
    if (el) return el;
  }
  return null;
}

export type RemoteAttachGate<TRoom> = {
  /** Сброс при hold / смене комнаты / unmount. Инкремент generation. */
  invalidate: (reason: string) => void;
  /** Запросить attach; если DOM нет — остаётся pending. */
  request: (room: TRoom, slotId: string, reason: string) => RemoteAttachResult;
  /** Вызвать при mount/unmount video|audio ref. */
  notifyElements: (reason?: string) => RemoteAttachResult;
  flush: (reason: string) => RemoteAttachResult;
  hasPending: () => boolean;
  pendingSlotId: () => string | null;
  generation: () => number;
  /** Slot, для которого последний раз успешно прикрепили к DOM. */
  attachedSlotId: () => string | null;
};

export function createRemoteAttachGate<TRoom>(opts: {
  getVideos: () => Array<HTMLVideoElement | null>;
  getAudios: () => Array<HTMLAudioElement | null>;
  attach: (
    room: TRoom,
    videos: Array<HTMLVideoElement | null>,
    audios: Array<HTMLAudioElement | null>,
    reason: string
  ) => void;
  clear: (
    videos: Array<HTMLVideoElement | null>,
    audios: Array<HTMLAudioElement | null>,
    reason: string
  ) => void;
  onEvent?: (event: string, fields: Record<string, unknown>) => void;
}): RemoteAttachGate<TRoom> {
  let generation = 0;
  let pending: { room: TRoom; slotId: string; generation: number } | null =
    null;
  let lastAttached: {
    generation: number;
    slotId: string;
    room: TRoom;
    video: HTMLVideoElement | null;
    audio: HTMLAudioElement | null;
  } | null = null;

  const invalidate = (reason: string) => {
    generation += 1;
    pending = null;
    lastAttached = null;
    opts.clear(opts.getVideos(), opts.getAudios(), reason);
    opts.onEvent?.("remote_attach_invalidate", { reason, generation });
  };

  const flush = (reason: string): RemoteAttachResult => {
    if (!pending || pending.generation !== generation) {
      return "idle";
    }
    const videos = opts.getVideos();
    const audios = opts.getAudios();
    if (!hasUsableRemoteElements(videos, audios)) {
      opts.onEvent?.("remote_attach_pending", {
        reason,
        slotId: pending.slotId,
        generation,
      });
      return "pending";
    }
    const video = primaryEl(videos);
    const audio = primaryEl(audios);
    if (
      lastAttached &&
      lastAttached.generation === generation &&
      lastAttached.slotId === pending.slotId &&
      lastAttached.room === pending.room &&
      lastAttached.video === video &&
      lastAttached.audio === audio
    ) {
      opts.onEvent?.("remote_attach_skip_duplicate", {
        reason,
        slotId: pending.slotId,
        generation,
      });
      return "skipped_duplicate";
    }
    opts.attach(pending.room, videos, audios, reason);
    lastAttached = {
      generation,
      slotId: pending.slotId,
      room: pending.room,
      video,
      audio,
    };
    opts.onEvent?.("remote_attach_ok", {
      reason,
      slotId: pending.slotId,
      generation,
    });
    return "attached";
  };

  const request = (
    room: TRoom,
    slotId: string,
    reason: string
  ): RemoteAttachResult => {
    pending = { room, slotId, generation };
    opts.onEvent?.("remote_attach_request", { reason, slotId, generation });
    return flush(reason);
  };

  const notifyElements = (
    reason = "elements_changed"
  ): RemoteAttachResult => flush(reason);

  return {
    invalidate,
    request,
    notifyElements,
    flush,
    hasPending: () =>
      Boolean(pending && pending.generation === generation),
    pendingSlotId: () =>
      pending && pending.generation === generation ? pending.slotId : null,
    generation: () => generation,
    attachedSlotId: () =>
      lastAttached && lastAttached.generation === generation
        ? lastAttached.slotId
        : null,
  };
}
