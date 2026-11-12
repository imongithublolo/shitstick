#!/usr/bin/env python3
"""Prepare the RMMZ web game payload for the portal.

1. Copies the browser-relevant files from the extracted GameJolt build into
   public/game/ (stripping the nw.js/Windows runtime).
2. Generates public/game/game-files.json — manifest of every game file + size,
   used by the portal downloader for progress reporting.
3. Generates PWA icons (192 / 512 / maskable / apple-touch) from the game icon.
"""
import json
import os
import shutil
import urllib.parse
from PIL import Image

SRC = "/tmp/gj/extracted/ShitstickAdventure"
DST = "/home/z/my-project/public/game"
ICONS = "/home/z/my-project/public/icons"

WEB_DIRS = ["js", "data", "img", "audio", "fonts", "css", "effects", "uicustom", "icon"]


def main():
    # --- wipe destination -------------------------------------------------
    if os.path.exists(DST):
        shutil.rmtree(DST)
    os.makedirs(DST, exist_ok=True)

    # --- copy web payload --------------------------------------------------
    for d in WEB_DIRS:
        src_dir = os.path.join(SRC, d)
        if os.path.isdir(src_dir):
            shutil.copytree(src_dir, os.path.join(DST, d))

    for f in ["index.html"]:
        src_f = os.path.join(SRC, f)
        if os.path.isfile(src_f):
            shutil.copy2(src_f, os.path.join(DST, f))

    # root *.json sprite definitions (tiny files, TN generator outputs)
    for f in os.listdir(SRC):
        if f.endswith(".json") and os.path.isfile(os.path.join(SRC, f)):
            shutil.copy2(os.path.join(SRC, f), os.path.join(DST, f))

    # --- strip editor backup files (*~) ------------------------------------
    for root, _dirs, names in os.walk(DST):
        for n in names:
            if n.endswith("~"):
                os.remove(os.path.join(root, n))

    # --- fix dotfiles: static servers block them, and the engine encodes
    # leading-dot names into URLs that can never be served. Rename and patch
    # the game's data references (e.g. ".",FTAnger" -> "_FTAnger").
    renames: list[tuple[str, str]] = []
    for root, _dirs, names in os.walk(DST):
        for n in names:
            if n.startswith("."):
                old_path = os.path.join(root, n)
                new_path = os.path.join(root, "_" + n[1:])
                os.rename(old_path, new_path)
                old_base = os.path.splitext(n)[0]
                new_base = os.path.splitext("_" + n[1:])[0]
                renames.append((old_base, new_base))
                print(f"Renamed dotfile: {n} -> {'_' + n[1:]}")
    if renames:
        data_dir = os.path.join(DST, "data")
        for fn in os.listdir(data_dir):
            if not fn.endswith(".json"):
                continue
            fp = os.path.join(data_dir, fn)
            with open(fp, "r", encoding="utf-8") as fh:
                content = fh.read()
            changed = False
            for old_base, new_base in renames:
                if old_base in content:
                    content = content.replace(old_base, new_base)
                    changed = True
            if changed:
                with open(fp, "w", encoding="utf-8") as fh:
                    fh.write(content)
                print(f"Patched references in data/{fn}")

    # --- patch: preserveDrawingBuffer for CRT frame capture ----------------
    # The portal samples the game's WebGL canvas as a texture every frame to
    # apply the CRT shader. Pixi defaults to preserveDrawingBuffer:false, which
    # clears the drawing buffer after compositing and makes cross-frame reads
    # unreliable.
    core_path = os.path.join(DST, "js", "rmmz_core.js")
    with open(core_path, "r", encoding="utf-8") as fh:
        core = fh.read()
    old = "view: this._canvas,\n            autoStart: false\n        });"
    new = ("view: this._canvas,\n            autoStart: false,\n"
           "            preserveDrawingBuffer: true\n        });")
    if old in core:
        core = core.replace(old, new, 1)
        with open(core_path, "w", encoding="utf-8") as fh:
            fh.write(core)
        print("Patched rmmz_core.js: preserveDrawingBuffer=true")
    else:
        print("WARN: rmmz_core.js patch target not found (already patched?)")

    # --- patch: allow software-rendered browsers ----------------------------
    # PIXI 5's WebGL support probe runs with failIfMajorPerformanceCaveat:true,
    # which hard-fails ("Failed to initialize graphics") on software-rendered
    # browsers (headless, VMs, some laptops). The renderer itself works fine
    # there, so we relax only the support-check flag.
    pixi_path = os.path.join(DST, "js", "libs", "pixi.js")
    with open(pixi_path, "a", encoding="utf-8") as fh:
        fh.write(
            "\n// [web portal patch] allow software-rendered browsers to boot\n"
            "PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;\n"
        )
    print("Patched pixi.js: FAIL_IF_MAJOR_PERFORMANCE_CAVEAT=false")

    # --- generate file manifest -------------------------------------------
    # RMMZ requests images and audio through Utils.encodeURI (= encodeURIComponent
    # per path segment), so the manifest stores the *runtime request URL* for
    # those files — otherwise the service-worker cache key would never match
    # what the game actually asks for (& -> %26, $ -> %24, space -> %20 ...).
    # Everything else (js, data, fonts, css, ...) is requested raw.
    def runtime_url(rel: str) -> str:
        if rel.startswith("img/") or rel.startswith("audio/") or rel.startswith("uicustom/"):
            # mirror JS encodeURIComponent exactly (it leaves ! ' ( ) * - _ . ~)
            return "/".join(urllib.parse.quote(seg, safe="!*'()") for seg in rel.split("/"))
        return rel

    files = []
    total = 0
    for root, _dirs, names in os.walk(DST):
        for n in sorted(names):
            full = os.path.join(root, n)
            rel = os.path.relpath(full, DST).replace(os.sep, "/")
            size = os.path.getsize(full)
            url = runtime_url(rel)
            files.append({"p": url, "d": rel, "s": size})
            total += size

    manifest = {
        "version": 2,
        "game": "ShitStickAdventure",
        "developer": "TMX2023",
        "source": "https://gamejolt.com/games/hollyshit_Im_insanely_shit_adventuring_it/1005951",
        "totalBytes": total,
        "fileCount": len(files),
        "files": files,
    }
    with open(os.path.join(DST, "game-files.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, separators=(",", ":"))

    # --- PWA icons -----------------------------------------------------------
    os.makedirs(ICONS, exist_ok=True)
    src_icon = Image.open(os.path.join(SRC, "icon", "icon.png")).convert("RGBA")

    def save_scaled(img: Image.Image, size: int, path: str, pad_ratio: float = 0.0):
        if pad_ratio > 0:
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            inner = int(size * (1 - pad_ratio * 2))
            scaled = img.resize((inner, inner), Image.LANCZOS)
            canvas.paste(scaled, ((size - inner) // 2, (size - inner) // 2), scaled)
        else:
            canvas = img.resize((size, size), Image.LANCZOS)
        canvas.save(path, "PNG")

    save_scaled(src_icon, 192, f"{ICONS}/icon-192.png")
    save_scaled(src_icon, 512, f"{ICONS}/icon-512.png")
    save_scaled(src_icon, 512, f"{ICONS}/icon-maskable-512.png", pad_ratio=0.12)
    save_scaled(src_icon, 180, f"{ICONS}/apple-touch-icon.png")
    save_scaled(src_icon, 128, "/home/z/my-project/public/game-icon.png")

    # --- summary -------------------------------------------------------------
    print(f"Game payload: {total/1024/1024:.1f} MB across {len(files)} files -> {DST}")
    by_ext = {}
    for f in files:
        ext = f["p"].rsplit(".", 1)[-1] if "." in f["p"] else "?"
        by_ext[ext] = by_ext.get(ext, 0) + f["s"]
    for ext, sz in sorted(by_ext.items(), key=lambda kv: -kv[1]):
        print(f"  .{ext}: {sz/1024/1024:.2f} MB")
    print("Icons written to", ICONS)


if __name__ == "__main__":
    main()
