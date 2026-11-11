/**
 * Preflight WebGL capabilities used by MediaPipe ImageSegmenter GPU postprocess.
 * MediaPipe may abort the renderer (tab crash) when float/half-float color buffers
 * are missing — see google-ai-edge/mediapipe#6296.
 */

export type CameraBackgroundWebGlProbe = {
  webgl2: boolean;
  floatColorBuffer: boolean;
  halfFloatColorBuffer: boolean;
  /** Safe for MediaPipe GPU mask postprocess path. */
  mediapipeGpuSafe: boolean;
  detail: string;
};

export function probeCameraBackgroundWebGl(
  documentRef: {
    createElement: (tag: "canvas") => HTMLCanvasElement;
  } | null = typeof document !== "undefined" ? document : null
): CameraBackgroundWebGlProbe {
  if (!documentRef) {
    return {
      webgl2: false,
      floatColorBuffer: false,
      halfFloatColorBuffer: false,
      mediapipeGpuSafe: false,
      detail: "no_document",
    };
  }

  let gl: WebGL2RenderingContext | null = null;
  try {
    const canvas = documentRef.createElement("canvas");
    gl = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
    });
  } catch {
    gl = null;
  }

  if (!gl) {
    return {
      webgl2: false,
      floatColorBuffer: false,
      halfFloatColorBuffer: false,
      mediapipeGpuSafe: false,
      detail: "webgl2_unavailable",
    };
  }

  const floatColorBuffer = Boolean(
    gl.getExtension("EXT_color_buffer_float") ||
      gl.getExtension("WEBGL_color_buffer_float")
  );
  const halfFloatColorBuffer = Boolean(
    gl.getExtension("EXT_color_buffer_half_float")
  );

  // Explicitly drop the probe context so we do not consume a WebGL slot.
  try {
    const lose = (gl as WebGL2RenderingContext & {
      getExtension: (name: string) => { loseContext?: () => void } | null;
    }).getExtension("WEBGL_lose_context");
    lose?.loseContext?.();
  } catch {
    /* ignore */
  }

  const mediapipeGpuSafe = floatColorBuffer || halfFloatColorBuffer;
  return {
    webgl2: true,
    floatColorBuffer,
    halfFloatColorBuffer,
    mediapipeGpuSafe,
    detail: mediapipeGpuSafe
      ? floatColorBuffer
        ? "float_ok"
        : "half_float_ok"
      : "float_buffers_missing",
  };
}
