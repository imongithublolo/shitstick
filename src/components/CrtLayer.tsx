"use client";

/**
 * CRT layer — samples the game iframe's WebGL canvas every frame and renders
 * it through the gingerbeardman CRT shader on a WebGL2 canvas that exactly
 * overlays the game canvas (letterboxing included).
 *
 * The game canvas is kept at opacity 0 while the filter is active so only the
 * shader output is visible; it is restored when the filter is off.
 */
import { useEffect, useRef } from "react";
import {
  CRT_FRAGMENT_SOURCE,
  CRT_VERTEX_SOURCE,
  CRT_UNIFORM_NAMES,
} from "@/lib/crtShader";
import { useSettings } from "@/lib/settings";
import { gameCanvas } from "@/lib/gameBridge";

type Props = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onFallback?: (reason: string) => void;
};

const PIXEL_RATIO_CAP = 2;

export function CrtLayer({ iframeRef, onFallback }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const crt = useSettings((s) => s.crt);
  const crtRef = useRef(crt);
  useEffect(() => {
    crtRef.current = crt;
  }, [crt]);
  const textureRef = useRef<WebGLTexture | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      onFallback?.("WebGL2 unavailable — CRT filter disabled");
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) || "shader compile error");
      }
      return sh;
    };

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, CRT_VERTEX_SOURCE));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, CRT_FRAGMENT_SOURCE));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "program link error");
      }
    } catch (err) {
      onFallback?.(`CRT shader failed: ${String(err)}`);
      return;
    }

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of CRT_UNIFORM_NAMES) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const texture = gl.createTexture();
    textureRef.current = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const applySmoothing = (on: boolean) => {
      const filter = on ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    };
    applySmoothing(crtRef.current.smoothing);

    let raf = 0;
    let lastCanvas: HTMLCanvasElement | null = null;

    const syncToGameCanvas = () => {
      const gcanvas = gameCanvas(iframeRef.current);
      if (gcanvas !== lastCanvas) {
        if (lastCanvas) lastCanvas.style.opacity = "";
        lastCanvas = gcanvas;
      }
      if (!gcanvas) {
        canvas.style.display = "none";
        return null;
      }

      const settings = crtRef.current;
      if (!settings.enabled) {
        gcanvas.style.opacity = "";
        canvas.style.display = "none";
        return null;
      }

      gcanvas.style.opacity = "0";
      canvas.style.display = "block";

      // Mirror the game canvas' on-screen box inside the stage container.
      const parent = canvas.parentElement;
      if (parent) {
        const rect = gcanvas.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const left = rect.left - parentRect.left;
        const top = rect.top - parentRect.top;
        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const dpr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);
        const w = Math.max(2, Math.round(rect.width * dpr));
        const h = Math.max(2, Math.round(rect.height * dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
      }
      return gcanvas;
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const gcanvas = syncToGameCanvas();
      if (!gcanvas) return;

      const s = crtRef.current;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gcanvas);

      gl.uniform1i(uniforms.uTexture, 0);
      gl.uniform1i(uniforms.uEnabled, 1); // layer hidden entirely when disabled
      gl.uniform1f(uniforms.scanlineIntensity, s.scanlineIntensity);
      gl.uniform1f(uniforms.scanlineCount, s.scanlineCount);
      gl.uniform1f(uniforms.time, ts * 0.001);
      gl.uniform1f(uniforms.yOffset, 0.0);
      gl.uniform1f(uniforms.brightness, s.brightness);
      gl.uniform1f(uniforms.contrast, s.contrast);
      gl.uniform1f(uniforms.saturation, s.saturation);
      gl.uniform1f(uniforms.bloomIntensity, s.bloomIntensity);
      gl.uniform1f(uniforms.bloomThreshold, s.bloomThreshold);
      gl.uniform1f(uniforms.rgbShift, s.rgbShift);
      gl.uniform1f(uniforms.adaptiveIntensity, s.adaptiveIntensity);
      gl.uniform1f(uniforms.vignetteStrength, s.vignetteStrength);
      gl.uniform1f(uniforms.curvature, s.curvature);
      gl.uniform1f(uniforms.flickerStrength, s.flickerStrength);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (lastCanvas) lastCanvas.style.opacity = "";
      textureRef.current = null;
      gl.deleteTexture(texture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
     
  }, [iframeRef]);

  // texture filtering can be flipped live
  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2");
    const texture = textureRef.current;
    if (!canvas || !gl || !texture) return;
    const filter = crt.smoothing ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }, [crt.smoothing]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute z-10"
      style={{ display: "none", imageRendering: crt.smoothing ? "auto" : "pixelated" }}
      aria-hidden
    />
  );
}
