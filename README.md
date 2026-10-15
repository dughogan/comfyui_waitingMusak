# comfyui_waitingMusak

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
| **8-bit Scarecrow Shuffle** | A soft-shoe chiptune whose phrases climb hopefully to a held note, then sigh back down. Your render has no brain, only a GPU. |
| **Beachside Bossa** | Nylon-like chords, a soft flute-like lead and an unhurried bass pulse. Sand in the VRAM. |
| **Lo-fi Hip-Hop** | Dusty Rhodes chords, swung boom-bap drums, wobbly tape and vinyl crackle. Beats to render to. |
| **Lo-fi Jazz Café** | Brushed drums, a walking upright bass, piano comping and a breathy lead. Your latent is having an espresso. |
| **Lo-fi Synthwave** | Warm pads, a pulsing octave bass and a soft square lead, slightly worn. Neon, but on cassette. |
| **Lo-fi City Pop** | Bright electric piano stabs, a bouncy bass line and a sunny lead. A night drive while the sampler runs. |
| **Lo-fi Paranormal (X-Files-inspired)** | A slow whistled melody drifting through long echoes over a looping piano figure and an eerie pad. The truth is in the output folder. |
| **Grid Runner (Tron-inspired)** | Four-on-the-floor electro, a pulsing analog-style bass arpeggio and big swelling brass. Your tensors have entered the grid. |

All twelve are original synthesized instrumental loops, not recordings or arrangements of existing songs. The "inspired" styles evoke a genre or mood; their melodies are written from scratch, and this project is not affiliated with Nintendo, 20th Television or Disney. The lo-fi styles add swung drums, tape wobble, a warm low-pass and vinyl crackle, all generated in your browser.

## Install

From your ComfyUI `custom_nodes` directory:

```sh
git clone https://github.com/dughogan/comfyui_waitingMusak.git
```

Restart ComfyUI, refresh the interface, and click **Run**. No `pip install` or other dependencies required.

For ComfyUI Desktop, use the `custom_nodes` folder inside your configured ComfyUI base directory. You can also download this repository as a ZIP and extract its folder there.

**Upgrading from the early `ComfyUI-Elevator-Music` version?** Replace that folder with this one rather than keeping both installed. Your existing settings use the same IDs and are preserved.

## Controls

Open **Settings → Elevator Music**, or search settings for **Elevator**.

- **Enable waitingMusak sounds** — master on/off for automatic run sounds, enabled by default.
- **Play background music while running** — turn off for silent waiting while keeping the completion ding.
- **Elevator music style** — choose a style; switches during playback with a short fade.
- **Elevator music volume** — 0–100, default 25.
- **Ding when the run completes** — toggle the completion bell.
- **Preview selected music (12 seconds)** — click **Preview selected music** to audition your choice without running a workflow; click **Stop preview** to end early. Changing styles during a preview auditions the new selection. Works even with automatic run music disabled. Preview temporarily pauses any run soundtrack and restores it afterward if the run is still active. Starting a workflow stops the preview.

ComfyUI saves your preferences. No workflow edits are needed.

**Ding only:** leave **Enable waitingMusak sounds** and **Ding when the run completes** on, and turn **Play background music while running** off. The preview button still lets you audition music. Existing installations keep their previous master sound preference.

## How it behaves

- Starts when you submit a run from this page and stays on while it queues or executes.
- Waits for all prompts in a submitted batch, then dings once on success.
- Failures, interruptions, queue deletion and disconnects do not trigger a success ding. If an interrupted batch still has queued work, music continues until that work ends.
- Handles very fast cached runs, including completion arriving before the queue response.
- Generates audio locally through Web Audio. No streaming, external audio requests, extra Python dependencies, or diffusion GPU workload.
- Uses looping audio buffers so music doesn't rely on background-tab JavaScript timers.

Browser autoplay needs a click or keypress; clicking Run normally provides it. Reloading a page loses tracking of jobs already running. Use one submitting tab to avoid overlapping music. Live ComfyUI integration can vary with frontend versions and other extensions that replace queue methods.

## Comfy Monitor

Check on your renders from your phone or another computer. Comfy Monitor starts and stops with ComfyUI and runs a small status page, styled in the Comfy brand, on its own port. **Settings → Elevator Music → Comfy Monitor** shows its addresses, a QR code to open it on your phone, and how it works. The address looks like this:

```
http://<your-comfy-pc-ip>:8190
```

**Who can open it** follows ComfyUI by default. Out of the box ComfyUI only accepts connections from its own computer, and so does the monitor (`http://127.0.0.1:8190`), so installing waitingMusak never exposes your renders or job controls to the network on its own. If you start ComfyUI with `--listen`, the monitor is shared on the network too. To change it, set **Settings → Elevator Music → Comfy Monitor → Who can open Comfy Monitor** to **This computer only** or **Home network**, then restart ComfyUI. Tailscale HTTPS (below) works with every choice.

- **Now running:** workflow name, current node, step progress, overall node progress, elapsed time and the latest outputs.
- **Stop render** cancels the running job, and **✕** removes a job from the queue. Both ask first.
- **Queued** jobs and **Recent** finished jobs (done, failed with the error message, or stopped), with thumbnails of every output.
- **Tap any output to view it full-screen:** pinch, scroll or double-tap to zoom images; play videos and audio; drag to orbit 3D models (`.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.ply`) and Gaussian splats (`.ply`, `.splat`, `.ksplat`, `.spz`), with pinch or scroll to zoom and two fingers to pan. Use ‹ › or the arrow keys to step through a job's outputs, and ⬇ to download. The 3D viewers (three.js and gaussian-splats-3d) load from jsDelivr the first time you open a 3D file, so that device needs internet access.
- The browser tab title shows the live percentage, then ✓ or ✕ when the job ends.
- **Sound on this device:** tap **Sound off** at the top to turn sound on. The waitingMusak music then plays while jobs are running or queued, and the bell plays (and Android vibrates) when the queue finishes with a success. **Music on/off** and **Ding on/off** work separately, so you can mute the music and still get the ding. Style, volume and a 12-second **Preview** are there too. These settings are saved per device and are separate from the ones inside ComfyUI.

Phones only allow sound after a tap, and they pause background tabs, so keep the page open in front for music and the ding. On iPhone the music plays even with the Ring/Silent switch on silent; if Safari pauses sound (after locking the phone, for example), the button reads **Tap to hear**, and any tap brings it back.

It sees every job, including ones queued from other tabs or through the API. It can stop and remove jobs but never queue or edit them, and it only serves files from your output folder. The stop and remove buttons only accept requests from the monitor page itself, so other websites can't press them. Set `WAITINGMUSAK_MONITOR_CONTROL=0` for a view-only monitor. Workflow names come from the ComfyUI tab that submitted the job; jobs queued another way show a short job ID.

Environment variables, set before starting ComfyUI, override the settings: `WAITINGMUSAK_MONITOR_PORT` (default `8190`, `0` turns the monitor off), `WAITINGMUSAK_MONITOR_HOST` (the address to listen on, for example `0.0.0.0` for every network or `127.0.0.1` for this computer only) and `WAITINGMUSAK_MONITOR_CONTROL=0` (view-only). If another device can't connect to a shared monitor, allow Python through Windows Firewall for private networks.

### Away from home with Tailscale

Tailscale is optional. Without it, or while it's signed out, the monitor works exactly as above on your home network. Open **Remote access** at the bottom of the monitor to see your addresses and set Tailscale up:

1. Install [Tailscale](https://tailscale.com/download) on the ComfyUI computer and sign in. If it's installed but signed out, open the monitor **on that computer** and press **Sign in**. For safety, signing in can't be started from another device: the sign-in link would attach the computer to whichever account opens it.
2. Install Tailscale on your phone and sign in with the same account.
3. Within a minute the monitor shows a **Tailscale** address, such as `http://100.x.y.z:8190`.
4. Press **Turn on HTTPS** for an address like `https://<computer>.<tailnet>.ts.net`. This is the best one for a phone: Tailscale relays it to the monitor on this computer, so Windows Firewall doesn't get in the way, and Safari treats it as a secure page. If your tailnet doesn't have HTTPS certificates yet, the monitor links to the Tailscale DNS settings where you turn on MagicDNS and HTTPS.

**Turn off HTTPS** removes it again. From a terminal, the same steps are `tailscale serve --bg 8190` and `tailscale serve --https=443 off`. Don't port-forward the monitor to the internet; Tailscale keeps it private to your own devices.

## Development and tests

The music and run tests need Node.js; the Comfy Monitor tests need Python with aiohttp (ComfyUI's own Python works, ComfyUI itself is not needed):

```sh
npm test
python -m unittest discover -s tests -p "test_*.py"
```

Node tests cover run lifecycle, batches, cached completions, errors, disconnects and waveform checks for every style, including a clean loop seam. Python tests cover which output files the monitor finds and serves (and that nothing outside the output folder is reachable), who can connect, Tailscale status parsing and the cross-site guard on Stop and Remove. For actual Web Audio playback, serve the repository with a local HTTP server, open `tests/browser.html`, and click **Enable test audio**. The page checks live style switching, volume, completion, cleanup and mute.

The frontend registers through ComfyUI's extension API, wraps queue calls while preserving arguments/results/exceptions, and listens for execution success/error/interruption events. See [ComfyUI's extension examples](https://docs.comfy.org/custom-nodes/js/javascript_examples).

To uninstall, remove this custom node folder and restart ComfyUI.

## License

MIT. Please enjoy responsibly between floors.
