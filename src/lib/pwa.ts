"use client";

/**
 * PWA plumbing: service worker registration, install prompt capture, and the
 * explicit game-asset downloader that fills the service worker's game cache
 * with byte-accurate progress reporting.
 */

export type DownloadProgress = {
  bytes: number;
  totalBytes: number;
  filesDone: number;
  filesTotal: number;
  currentFile: string;
  recent: string[];
  phase: "idle" | "downloading" | "done" | "error";
  error?: string;
};

export const GAME_CACHE = "ssa-game-v2";
const CONCURRENCY = 4;
const VERSION_KEY = "ssa-game-version";

let deferredInstallPrompt: any = null;

/**
 * The PWA stays installable (offline, service worker, manifest), but no
 * install popup is ever shown: the browser's beforeinstallprompt event is
 * captured and prevented here. Users can still install from the browser
 * menu ("Install app" / "Add to Home Screen").
 */
export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });
}

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    // Service workers (and Cache Storage) require a secure context.
    return;
  }
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    /* non-fatal: the game still works online */
  });
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

type ManifestFile = { p: string; d?: string; s: number };
type Manifest = { version: number; totalBytes: number; fileCount: number; files: ManifestFile[] };

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch("/game/game-files.json", { cache: "no-store" });
  if (!res.ok) throw new Error("game-files.json unavailable");
  return res.json();
}

/** Is the whole game payload (at the CURRENT manifest version) cached? */
export async function isGameCached(): Promise<{
  cached: boolean;
  filesDone: number;
  filesTotal: number;
}> {
  try {
    const manifest = await fetchManifest();
    const total = manifest.fileCount;
    if (!("caches" in window)) {
      return { cached: false, filesDone: 0, filesTotal: total };
    }
    const storedVersion = Number(localStorage.getItem(VERSION_KEY) || 0);
    if (storedVersion !== manifest.version) {
      // payload version changed since the last download: needs a refresh
      return { cached: false, filesDone: 0, filesTotal: total };
    }
    const cache = await caches.open(GAME_CACHE);
    let done = 0;
    const files = manifest.files;
    for (let i = 0; i < files.length; i += 64) {
      const batch = files.slice(i, i + 64);
      const results = await Promise.all(batch.map((f) => cache.match(`/game/${f.p}`)));
      results.forEach((r) => {
        if (r) done += 1;
      });
    }
    return { cached: done >= files.length, filesDone: done, filesTotal: files.length };
  } catch {
    return { cached: false, filesDone: 0, filesTotal: 0 };
  }
}

/**
 * Downloads every game asset into the service worker cache. Already-cached
 * files are skipped, so interrupted downloads resume. Progress is reported
 * with byte accuracy by streaming each response.
 */
export async function downloadGameAssets(
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  const state: DownloadProgress = {
    bytes: 0,
    totalBytes: 0,
    filesDone: 0,
    filesTotal: 0,
    currentFile: "",
    recent: [],
    phase: "downloading",
  };
  const emit = () => onProgress({ ...state, recent: [...state.recent] });

  try {
    const manifest = await fetchManifest();
    state.totalBytes = manifest.totalBytes;
    state.filesTotal = manifest.files.length;
    emit();

    if (!("caches" in window)) {
      throw new Error("Cache Storage unavailable (needs HTTPS)");
    }

    // If the payload version changed, drop the old cache so every file is
    // fetched fresh (cache keys are URLs, not content hashes).
    const storedVersion = Number(localStorage.getItem(VERSION_KEY) || 0);
    if (storedVersion !== manifest.version) {
      await caches.delete(GAME_CACHE);
    }

    const cache = await caches.open(GAME_CACHE);

    let index = 0;
    let active = 0;

    const recentPaths: string[] = [];

    const worker = async () => {
      while (index < manifest.files.length) {
        const i = index++;
        const file = manifest.files[i];
        const url = `/game/${file.p}`;
        const display = file.d || file.p;
        const cached = await cache.match(url);
        if (cached) {
          state.bytes += file.s;
          state.filesDone += 1;
          continue;
        }
        state.currentFile = display;
        emit();

        const res = await fetch(url);
        if (!res.ok) throw new Error(`${file.p}: HTTP ${res.status}`);

        // stream to count bytes precisely (falls back to manifest size)
        let buf: ArrayBuffer;
        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            state.bytes += value.byteLength;
          }
          const total = new Uint8Array(received);
          let off = 0;
          for (const c of chunks) {
            total.set(c, off);
            off += c.byteLength;
          }
          buf = total.buffer;
        } else {
          buf = await res.arrayBuffer();
          state.bytes += file.s;
        }

        await cache.put(url, new Response(buf, {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": res.headers.get("Content-Type") || "application/octet-stream" },
        }));

        state.filesDone += 1;
        recentPaths.push(display);
        if (recentPaths.length > 5) recentPaths.shift();
        state.recent = recentPaths;
        state.currentFile = display;
        emit();
      }
    };

    await new Promise<void>((resolve, reject) => {
      const onError = (err: unknown) => {
        state.phase = "error";
        state.error = String(err instanceof Error ? err.message : err);
        emit();
        reject(err);
      };
      const onDone = () => resolve();
      for (let n = 0; n < Math.min(CONCURRENCY, manifest.files.length); n++) {
        active += 1;
        worker().then(() => {
          active -= 1;
          if (active === 0) onDone();
        }, onError);
      }
    });

    state.phase = "done";
    state.currentFile = "";
    emit();
    try {
      localStorage.setItem(VERSION_KEY, String(manifest.version));
    } catch {
      /* ignore */
    }
  } catch (err) {
    state.phase = "error";
    state.error = String(err instanceof Error ? err.message : err);
    emit();
  }
}

export async function clearGameCache(): Promise<void> {
  try {
    await caches.delete(GAME_CACHE);
  } catch {
    /* ignore */
  }
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.active?.postMessage({ type: "CLEAR_GAME_CACHE" });
  }
}
