"use client";

/**
 * Debug overlay drawn on a 2D canvas above the game. Reads live positions
 * from the RMMZ engine: event hitboxes, per-tile passability and a player
 * info HUD.
 */
import { useEffect, useRef } from "react";
import { useSettings } from "@/lib/settings";
import { gameCanvas, gameWindow, readFps } from "@/lib/gameBridge";

type Props = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
};

const TILE = 48; // RMMZ tile size in game pixels

export function DebugOverlay({ iframeRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debug = useSettings((s) => s.debug);
  const debugRef = useRef(debug);
  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  const enabled = debug.showEvents || debug.showCollision || debug.showPlayerInfo;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const d = debugRef.current;
      const anyOn = d.showEvents || d.showCollision || d.showPlayerInfo;
      const gcanvas = gameCanvas(iframeRef.current);
      const w = gameWindow(iframeRef.current);
      if (!anyOn || !gcanvas || !w || !w.$gameMap || !w.$gamePlayer) {
        canvas.style.display = "none";
        return;
      }

      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = gcanvas.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      canvas.style.display = "block";
      canvas.style.left = `${rect.left - parentRect.left}px`;
      canvas.style.top = `${rect.top - parentRect.top}px`;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(2, Math.round(rect.width * dpr));
      const ch = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;

      const s = cw / (w.Graphics?.boxWidth || 816); // game px -> overlay px
      ctx.clearRect(0, 0, cw, ch);
      ctx.lineWidth = Math.max(1, dpr);

      const map = w.$gameMap;
      const player = w.$gamePlayer;

      // ---- passability grid -------------------------------------------------
      if (d.showCollision) {
        const originX = map.displayX ? map.displayX() : 0;
        const originY = map.displayY ? map.displayY() : 0;
        const startX = Math.floor(originX);
        const startY = Math.floor(originY);
        const tilesX = Math.ceil(cw / (TILE * s)) + 1;
        const tilesY = Math.ceil(ch / (TILE * s)) + 1;
        const tilePx = TILE * s;
        for (let ty = 0; ty <= tilesY; ty++) {
          for (let tx = 0; tx <= tilesX; tx++) {
            const gx = startX + tx;
            const gy = startY + ty;
            let passable = false;
            try {
              passable = map.checkPassage(gx, gy, 0x0f);
            } catch {
              /* out of bounds */
            }
            const px = (gx - originX) * tilePx;
            const py = (gy - originY) * tilePx;
            ctx.fillStyle = passable ? "rgba(74,222,128,0.13)" : "rgba(248,113,113,0.16)";
            ctx.fillRect(px, py, tilePx, tilePx);
          }
        }
      }

      // ---- event boxes -------------------------------------------------------
      if (d.showEvents) {
        const events = [];
        try {
          events.push(...map.events());
        } catch {
          /* ignore */
        }
        ctx.font = `${Math.max(9, 11 * dpr)}px ui-monospace, monospace`;
        for (const ev of events) {
          let sx = 0;
          let sy = 0;
          let name = "";
          try {
            sx = ev.screenX();
            sy = ev.screenY();
            name = ev.event()?.name || `EV${ev.eventId?.() ?? ""}`;
          } catch {
            continue;
          }
          if (!name || name.startsWith("EV")) continue; // only named events
          const x = sx * s;
          const y = sy * s;
          ctx.strokeStyle = "rgba(96,250,180,0.9)";
          ctx.strokeRect(x - 24 * s, y - 46 * s, 48 * s, 48 * s);
          const label = String(name);
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(x - tw / 2 - 4 * dpr, y - 46 * s - 16 * dpr, tw + 8 * dpr, 13 * dpr);
          ctx.fillStyle = "#a7f3d0";
          ctx.fillText(label, x - tw / 2, y - 46 * s - 6 * dpr);
        }
        // player box
        try {
          const px = player.screenX() * s;
          const py = player.screenY() * s;
          ctx.strokeStyle = "rgba(96,165,250,0.95)";
          ctx.strokeRect(px - 24 * s, py - 46 * s, 48 * s, 48 * s);
        } catch {
          /* ignore */
        }
      }

      // ---- player info HUD ---------------------------------------------------
      if (d.showPlayerInfo) {
        const lines: string[] = [];
        try {
          const mapId = map.mapId();
          const mapName =
            w.$dataMapInfos?.[mapId]?.name || `#${mapId}`;
          lines.push(`MAP ${mapId} · ${mapName}`);
          lines.push(`X ${player.x} · Y ${player.y} · DIR ${player.direction()}`);
          lines.push(
            `REGION ${map.regionId(player.x, player.y)} · EV ${map.events().length}`
          );
          lines.push(`GOLD ${w.$gameParty?.gold?.() ?? "-"} G`);
          lines.push(`FPS ${readFps(iframeRef.current)}`);
        } catch {
          /* ignore */
        }
        const fs = 11 * dpr;
        ctx.font = `${fs}px ui-monospace, monospace`;
        const pad = 8 * dpr;
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const boxH = lines.length * (fs + 4 * dpr) + pad;
        ctx.fillStyle = "rgba(0,0,0,0.72)";
        ctx.fillRect(pad, pad, widest + pad * 2, boxH);
        ctx.strokeStyle = "rgba(124,255,178,0.35)";
        ctx.strokeRect(pad, pad, widest + pad * 2, boxH);
        ctx.fillStyle = "#d1fae5";
        lines.forEach((l, i) => {
          ctx.fillText(l, pad * 2, pad + fs + 4 * dpr + i * (fs + 4 * dpr));
        });
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [iframeRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute z-20"
      style={{ display: "none" }}
      aria-hidden
    />
  );
}
