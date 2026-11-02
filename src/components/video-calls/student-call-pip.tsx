"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

import type { PipMediaEls } from "@/components/video-calls/teacher-call-pip";

export function StudentCallPip({
  teacherLabel,
  localLabel,
  teacherEmpty,
  localEmpty,
  showTeacher,
  waitText,
  onReturn,
  onMediaEls,
}: {
  teacherLabel: string;
  localLabel: string;
  teacherEmpty?: string;
  localEmpty?: string;
  showTeacher: boolean;
  waitText: string;
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
      <div style={videos} onClick={onReturn} role="button" tabIndex={0}>
        <div style={tile}>
          {showTeacher ? (
            <>
              <video
                ref={remoteRef}
                autoPlay
                playsInline
                muted
                style={tileVideo}
              />
              <audio ref={audioRef} autoPlay />
              <span style={name}>{teacherLabel}</span>
              {teacherEmpty ? <span style={emptyStyle}>{teacherEmpty}</span> : null}
            </>
          ) : (
            <span style={emptyStyle}>{waitText}</span>
          )}
        </div>
        <div style={tile}>
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            style={{ ...tileVideo, transform: "scaleX(-1)" }}
          />
          <span style={name}>{localLabel}</span>
          {localEmpty ? <span style={emptyStyle}>{localEmpty}</span> : null}
        </div>
      </div>
      <button type="button" style={returnBtn} onClick={onReturn}>
        На страницу звонка
      </button>
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
  gridTemplateRows: "1fr 1fr",
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
  fontSize: 13,
  color: "#d4d4d8",
  pointerEvents: "none",
};
const returnBtn: CSSProperties = {
  border: 0,
  background: "#2563eb",
  color: "#fff",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
};
