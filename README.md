# ComfyUI_LiftMeUpButtercup

### Your GPU is working hard. You are on hold.

Turn ComfyUI's Run button into a tiny elevator ride. Music plays while your workflow queues and runs, then fades out with a satisfying **ding** when the batch completes successfully.

No nodes to connect. No models to download. Just deeply unnecessary ambience.

## Choose your floor

| Style | The vibe |
| --- | --- |
| **Classic Lounge** | Electric piano and the quiet confidence of a hotel lobby. |
| **Bossa Nova** | Syncopated plucked chords. Your GPU has gone on holiday. |
| **8-bit Adventure (Zelda-inspired)** | Bright chip lead, rippling arpeggios and triangle-like bass. Your render is in another dungeon. |
| **Yacht Rock** | Mellow electric piano, a soft guitar-like lead and a relaxed bass groove. Inference, but on a boat. |

All four are original synthesized instrumental loops, not recordings or arrangements of existing songs. The adventure option evokes retro fantasy-game music; this project is not affiliated with Nintendo.

## Install

From your ComfyUI `custom_nodes` directory:

```sh
git clone https://github.com/dughogan/ComfyUI_LiftMeUpButtercup.git
```

Restart ComfyUI, refresh the interface, and click **Run**. No `pip install` or other dependencies required.

For ComfyUI Desktop, use the `custom_nodes` folder inside your configured ComfyUI base directory. You can also download this repository as a ZIP and extract its folder there.

**Upgrading from the early `ComfyUI-Elevator-Music` version?** Replace that folder with this one rather than keeping both installed. Your existing settings use the same IDs and are preserved.

## Controls

Open **Settings → Elevator Music**, or search settings for **Elevator**.

- **Play elevator music while running** — on/off, enabled by default.
- **Elevator music style** — choose a style; switches during playback with a short fade.
- **Elevator music volume** — 0–100, default 25.
- **Ding when the run completes** — toggle the completion bell.

ComfyUI saves your preferences. No workflow edits are needed.

## How it behaves

- Starts when you submit a run from this page and stays on while it queues or executes.
- Waits for all prompts in a submitted batch, then dings once on success.
- Failures, interruptions, queue deletion and disconnects do not trigger a success ding. If an interrupted batch still has queued work, music continues until that work ends.
- Handles very fast cached runs, including completion arriving before the queue response.
- Generates audio locally through Web Audio. No streaming, external audio requests, Python dependencies, or diffusion GPU workload.
- Uses looping audio buffers so music doesn't rely on background-tab JavaScript timers.

Browser autoplay needs a click or keypress; clicking Run normally provides it. Reloading a page loses tracking of jobs already running. Use one submitting tab to avoid overlapping music. Live ComfyUI integration can vary with frontend versions and other extensions that replace queue methods.

## Development and tests

Requires Node.js only to run the automated tests:

```sh
npm test
```

Tests cover run lifecycle, batches, cached completions, errors, disconnects and waveform checks for all four styles. For actual Web Audio playback, serve the repository with a local HTTP server, open `tests/browser.html`, and click **Enable test audio**. The page checks live style switching, volume, completion, cleanup and mute.

The frontend registers through ComfyUI's extension API, wraps queue calls while preserving arguments/results/exceptions, and listens for execution success/error/interruption events. See [ComfyUI's extension examples](https://docs.comfy.org/custom-nodes/js/javascript_examples).

To uninstall, remove this custom node folder and restart ComfyUI.

## License

MIT. Please enjoy responsibly between floors.
