# Changelog

## 1.10.0 — 2026-10-15

Comfy Monitor, six new styles and a lot of fixes. Versions 1.5–1.9 were local test builds and were never published; everything since 1.4.0 is listed here.

### Comfy Monitor (new)
- A phone-friendly page on its own port (default `8190`) that starts and stops with ComfyUI and shows every job, from any tab or app: workflow name, current node, step and node progress, elapsed time, the queue and recent results.
- **Stop render** and **✕** (remove from queue), both confirmed first. The monitor can never queue or edit a workflow. `WAITINGMUSAK_MONITOR_CONTROL=0` makes it view-only.
- Full-screen viewer for outputs: zoomable images, video and audio playback, orbitable 3D models (`.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.ply`) and Gaussian splats (`.ply`, `.splat`, `.ksplat`, `.spz`).
- Plays the waitingMusak music while jobs run and dings when the queue finishes, with Music and Ding toggled separately per device. Works with the iPhone Ring/Silent switch on silent.
- Remote access panel with optional Tailscale setup: status, sign-in (only from the ComfyUI computer itself), and one-tap HTTPS through `tailscale serve`.
- Styled in the Comfy brand, with the official Comfy icon for home-screen shortcuts.
- **Settings → Elevator Music → Comfy Monitor:** addresses, a QR code for phones, how it works, and **Who can open Comfy Monitor**.
- **Safe by default:** the monitor follows ComfyUI's own `--listen`. ComfyUI's default (this computer only) keeps the monitor on this computer too, so installing the plugin never exposes renders or job controls to the network by itself.
- Only serves files inside ComfyUI's output folder; Stop/Remove/Tailscale actions accept same-origin JSON requests only.

### Music
- Six new original styles: Lo-fi Hip-Hop, Lo-fi Jazz Café, Lo-fi Synthwave, Lo-fi City Pop, Lo-fi Paranormal (X-Files-inspired) and Grid Runner (Tron-inspired), built on a small data-driven engine (swung drums, tape wobble, echo, low-pass, vinyl crackle, sidechain pump) and matched in loudness to the originals.
- 8-bit Scarecrow Shuffle has a reworked, still original, soft-shoe melody.
- The new styles' low-pass filter now wraps around the loop seam correctly.
- The ComfyUI page tells the monitor which workflow each job came from.

### Tests
- Python tests for the monitor (`tests/test_monitor.py`).
- The loop-seam check now allows a style's own downbeat on sample 0 instead of failing every style with drums.

## 1.4.0 — 2026-09-21
- Independent background-music toggle for ding-only runs.

## 1.3.0 — 2026-09-17
- Original Scarecrow Shuffle and Beachside Bossa tracks.

## 1.2.0 — 2026-09-17
- Settings music preview with automatic stop and run coordination.

## 1.1.0 — 2026-09-17
- Project renamed to comfyui_waitingMusak.

## 1.1.0 — 2026-09-16 (first public commit)
- Elevator music while ComfyUI runs, and a ding when it's done.
