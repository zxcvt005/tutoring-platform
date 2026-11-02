"use client";

import { useLayoutEffect, useRef, type CSSProperties, type Ref } from "react";

export type PipMediaEls = {
  localVideo: HTMLVideoElement | null;
  remoteVideo: HTMLVideoElement | null;
  remoteAudio: HTMLAudioElement | null;
};

export type TeacherPipRoom = {
  id: string;
  label: string;
  active: boolean;
  kind: "hold" | "student";
};

export function TeacherCallPip({
  rooms,
  inHold,
  localLabel,
  remoteLabel,
  localEmpty,
  remoteEmpty,
  wantMic,
  wantCamera,
  switching,
  onHold,
  onActivate,
  onToggle,
  onReturn,
  onMediaEls,
}: {
  rooms: TeacherPipRoom[];
  inHold: boolean;
  localLabel: string;
  remoteLabel: string;
  localEmpty?: string;
  remoteEmpty?: string;
  wantMic: boolean;
  wantCamera: boolean;
  switching: boolean;
  onHold: () => void;
  onActivate: (id: string) => void;
  onToggle: (kind: "mic" | "camera") => void;
  onReturn: () => void;
  onMediaEls: (els: PipMediaEls) => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useLayoutEffect(() => {
    onMediaEls({
      localVideo: localRef.current,
      remoteVideo: remoteRef.current,
      remoteAudio: audioRef.current,
    });
  });

  return (
    <div style={shell}>
      <div
        style={{ ...videos, gridTemplateRows: inHold ? "1fr" : "1fr 1fr" }}
        onClick={onReturn}
        role="button"
        tabIndex={0}
      >
        <PipTile
          videoRef={localRef}
          label={localLabel}
          empty={localEmpty}
          mirror
        />
        {inHold ? null : (
          <PipTile
            videoRef={remoteRef}
            audioRef={audioRef}
            label={remoteLabel}
            empty={remoteEmpty}
          />
        )}
      </div>
      <div style={roomsBox}>
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            disabled={switching || room.active}
            onClick={() => {
              if (room.kind === "hold") onHold();
              else onActivate(room.id);
            }}
            style={room.active ? roomBtnActive : roomBtn}
          >
            {room.label}
          </button>
        ))}
      </div>
      <div style={controls}>
        <button type="button" style={ctrlBtn} onClick={() => onToggle("mic")}>
          {wantMic ? "Микрофон" : "Микрофон выкл."}
        </button>
        <button type="button" style={ctrlBtn} onClick={() => onToggle("camera")}>
          {wantCamera ? "Камера" : "Камера выкл."}
        </button>
        <button type="button" style={returnBtn} onClick={onReturn}>
          На страницу звонка
        </button>
      </div>
    </div>
  );
}

function PipTile({
  videoRef,
  audioRef,
  label,
  empty,
  mirror,
}: {
  videoRef: Ref<HTMLVideoElement>;
  audioRef?: Ref<HTMLAudioElement>;
  label: string;
  empty?: string;
  mirror?: boolean;
}) {
  return (
    <div style={tile}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          ...tileVideo,
          transform: mirror ? "scaleX(-1)" : undefined,
        }}
      />
      {audioRef ? <audio ref={audioRef} autoPlay /> : null}
      <span style={name}>{label}</span>
      {empty ? <span style={emptyStyle}>{empty}</span> : null}
    </div>
  );
}

const shell: CSSProperties = {
  display: "flex",
  height: "100%",
  flexDirection: "column",
  gap: 8,
  padding: 8,
};
const videos: CSSProperties = {
  display: "grid",
  flex: 1,
  gap: 8,
  minHeight: 0,
};
const tile: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 12,
  background: "#09090b",
  border: "1px solid #27272a",
};
const tileVideo: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  background: "#09090b",
};
const name: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  zIndex: 1,
  borderRadius: 999,
  background: "rgba(24,24,27,.86)",
  padding: "2px 8px",
  fontSize: 11,
};
const emptyStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  textAlign: "center",
  fontSize: 12,
  color: "#a1a1aa",
  pointerEvents: "none",
};
const roomsBox: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  maxHeight: 88,
  overflowY: "auto",
};
const roomBtn: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#3f3f46",
  background: "#27272a",
  color: "#e4e4e7",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};
const roomBtnActive: CSSProperties = {
  ...roomBtn,
  background: "#2563eb",
  borderColor: "#3b82f6",
  color: "#fff",
};
const controls: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};
const ctrlBtn: CSSProperties = {
  flex: 1,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#3f3f46",
  background: "#18181b",
  color: "#fafafa",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
};
const returnBtn: CSSProperties = {
  ...ctrlBtn,
  flex: "1 1 100%",
  background: "#2563eb",
  borderColor: "#2563eb",
};
