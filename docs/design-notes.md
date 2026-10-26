# Capri: Design Notes & Reference Analysis

This document provides a technical breakdown of the reference repositories ([mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop) and [seanyih/Capri](https://github.com/seanyih/Capri)) and outlines the module-by-module architectural mapping for **Capri**.

---

## 1. How the Reference Works

### 1.1. Electron Overlay & Window Management
- **Transparent Frameless Canvas:** The overlay is a single `BrowserWindow` with `transparent: true`, `frame: false`, `alwaysOnTop: true` at the `'screen-saver'` level, `skipTaskbar: true`, and `backgroundColor: '#00000000'`.
- **Display Work Area & Taskbar Floor:** In standard mode, the window bounds match the target monitor's `workArea`. When resting on the taskbar, bounds extend to the full monitor `bounds` (offset by 1px at the top so Windows doesn't register it as a full-screen immersive app that pauses wallpaper or suppresses notifications). A `floorGap` parameter communicates the taskbar height to the renderer so Capri's feet or sitting ledge align with the top of the taskbar.
- **DPI Awareness:** Windows operates in physical pixels for Win32 API calls and Device Independent Pixels (DIPs) in Electron. The bridge converts physical rects to DIPs via `screen.screenToDipRect(null, rect)`.

### 1.2. Pixel-Precise Hit Testing & Mouse Event Forwarding
- **The Core Challenge:** A full-screen transparent window would normally intercept all user clicks on the desktop, preventing interaction with underlying applications.
- **The Reference Solution:**
  1. By default, the overlay sets `overlay.setIgnoreMouseEvents(true, { forward: true })`. This allows all mouse events to pass straight through to whatever window is behind the overlay.
  2. The main process polls the global cursor position via `screen.getCursorScreenPoint()`. To conserve CPU, polling runs at ~30 Hz when the cursor is in the vicinity of Capri or active panels, and drops to ~2–5 Hz when far away.
  3. The renderer checks whether the cursor coordinates intersect:
     - An active UI panel (bounding client rects of the transmission panel, buttons, or biochip).
     - Capri's physical sprite body.
  4. Sprite body hit-testing is performed against an in-memory 1-byte-per-pixel alpha map generated at startup from `capri-full.png` (widened to 240×420 with the mirrored right arm). Screen coordinates are transformed into sprite UV space (taking scale, facing, bob, head offset, and sitting thigh foreshortening into account). If alpha at that coordinate exceeds threshold (alpha > 40), it counts as a hit.
  5. When the cursor enters a valid hit region, the renderer immediately calls `host.setInteractive(true)`, toggling `setIgnoreMouseEvents(false)`. When the cursor leaves, it resets to `setIgnoreMouseEvents(true, { forward: true })`.
  6. Overlay focus (`overlay.setFocusable(true)` + `overlay.focus()`) is only activated when an input field (such as chat text entry) is focused, and surrendered on blur or escape.
  7. **Mouse Hook Recovery:** If Windows drops the mouse hook after sleep or lock screen, a 2000 ms watchdog compares host cursor coordinates against renderer mouse events. If the cursor is moving inside the overlay but no mousemove events arrive, a rearm cycle (`setIgnoreMouseEvents(false)` then `true`) restores the hook.

### 1.3. Character Rigging & Cel Animation (`sprite.js` & `acting.js`)
- **Single Quad WebGL Fragment Shader:** The character is not animated via skeletal bone meshes or per-frame raster swaps. Instead, a single 240×420 texture quad (`capri-full.png`) is manipulated entirely inside a custom GLSL fragment shader:
  - **Head Tilt:** Rotates coordinates around `NECK = vec2(118.0, 152.0)` with smoothstep falloff below the collar.
  - **Mane Flare & Sway:** Value noise (`vnoise`) radiates from `MANE = vec2(116.0, 92.0)` outward while preserving the rigid boundary of the green mask (`FACE = vec2(124.0, 132.0)`).
  - **Mirrored Arm & Stretch:** The left reaching arm is mirrored around `MIRROR = 234.0` to form the right arm. Arms can rotate around shoulders and stretch longitudinally (`ARM_DIR = vec2(-0.85954, 0.51108)`) without getting wider, mimicking anime limb exaggeration.
  - **Sitting Rig:** Thighs are foreshortened (`thighScale = mix(1.0, 0.3, uSit)`) while knees and lower legs ride upward, allowing lower legs to kick independently around knee pivots (`KNEE_LX`, `KNEE_RX`).
  - **Smears & Afterimages:** Up to 2 previous head positions trail the movement (`uSmear`). Green (`[0.21, 1.0, 0.48]`) and red (`[1.0, 0.13, 0.32]`) copies split away during spins or mental turbulence (`uEcho`).
  - **Color Grading & Twinkle:** The texture's dull red is graded dynamically into hot neon red, and procedural star twinkling is applied to the mane surface.
  - **Relic Glitch & Line Boil:** Horizontal slice displacement bands and procedural 2D noise simulate hand-drawn line boiling.
- **Exposure Sheets (`acting.js`):** Poses are structured like anime exposure sheets on twos (12 fps) and ones (24 fps). There is no linear interpolation (lerp) between poses: each key drawing holds for a discrete integer number of frames, utilizing anticipation frames, smear frames, overshoots, and holds.

### 1.4. Window Tracking (`windows.js` + `windows.ps1`)
- A lightweight PowerShell child process compiles and executes an in-memory C# P/Invoke class (`CapriWindows`) at startup.
- `EnumWindows` scans top-level windows in z-order, filtering out minimized, cloaked, tool, or Capri's own window handles.
- Calls `DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS)` to obtain the true visible drop-shadow-clipped rectangle in physical screen coordinates.
- **Zero Inspection of Content:** Only window handle ID, physical coordinates (X, Y, W, H), and maximized state are returned. Window titles, process memory, and window contents are never inspected.
- Output is emitted as single-line JSON to stdout whenever window positions change.

### 1.5. Visual Effects (`fx.js`) & Panels (`panel.js`)
- **FX Layer:** High-speed 24 fps 2D canvas layer for drawing polygonal mane shards, geometric data glyphs (`01`, `▚`, `>_`), red lightning bolts, shockwave rings, and character cut-in banners.
- **Transmission Panel:** Cyberpunk aesthetic with hard beveled edges, high-contrast palette (dark ink background, paper text, neon green/magenta/violet accents), procedural glyph decode animations, and a violet misregistered drop shadow (`drop-shadow(6px 6px 0 var(--violet))`).
- **Sound Synthesis (`voice.js`):** Pure Web Audio API synthesis without bundled proprietary audio samples. Uses harmonic oscillator chirps, frequency-modulated minor-pentatonic blips for speech syllables, and noise buffers with bandpass filters for teleport zaps.

### 1.6. Personality & Voice (`seanyih/Capri`)
- Project Capricorn engram personality: bold, sarcastic, teasing, and playful ("Naw, c'mon!", "Who are you tryna haze?"), yet fundamentally grounded in precise, responsible engineering.
- **Strictly Excluded from Reference:** All dangerous commands, "cyberpsychosis" medium/max modes, automatic file alterations, git force pushes, and environment reading from `seanyih/Capri` are entirely eliminated. Only the visual styling and conversational character attitude are retained.

---

## 2. Module Mapping & Strategy: Reference vs. Capri

| Reference Module | Capri Module | Action | Technical Strategy & Rationale |
| :--- | :--- | :--- | :--- |
| `src/main/main.js` | `app/src/main/index.ts` + `app/src/main/overlay.ts` | **Adapt** | Split into structured TypeScript modules. Replace monolithic HTTP bridge with WebSocket server + Python child process manager. Maintain window sizing, display tracking, and tray integration. |
| `src/main/bridge.js` | `app/src/main/ws-server.ts` + `brain/ipc/ws_client.py` | **Replace** | Replace insecure local HTTP POST webhook with a hardened local WebSocket on `127.0.0.1` using a cryptographic handshake token and shared JSON Schema message validation. |
| `src/main/windows.js` + `windows.ps1` | `app/src/main/windows.ts` + `app/assets/scripts/windows.ps1` | **Port** | Port `windows.js` to strict TypeScript. Preserve `windows.ps1` C# P/Invoke logic for geometry tracking, converting physical pixels to DIPs. |
| `src/main/config.js` | `app/src/main/config.ts` | **Port** | Strict TypeScript schema with version migration, stored in `%APPDATA%\Capri\config.json`. |
| `src/main/setup.js` + `llm.js` | `brain/llm/` (Python) | **Move & Adapt** | Relocate all LLM calls, key management, and token accounting out of Electron into Python `brain/llm/provider.py` (OpenRouter API via `openai` SDK + `keyring` storage). |
| `src/main/apps.js` + `launch.js` | `brain/tools/system_tools.py` | **Move & Adapt** | Move app launching, media controls, and browser actions into Python tool registry with strict approval gating and path sandboxing. |
| `src/renderer/js/sprite.js` | `app/src/renderer/sprite/SpriteRenderer.ts` | **Port** | Exact port of the WebGL fragment shader and vertex buffers to TypeScript strict mode. Header: `Adapted from mochiiwuff/capri-desktop (MIT)`. |
| `src/renderer/js/acting.js` | `app/src/renderer/sprite/acting.ts` | **Port** | Exact port of the 12/24 fps exposure sheets, keyframe poses, cues, and pose resolvers. Header: `Adapted from mochiiwuff/capri-desktop (MIT)`. |
| `src/renderer/js/capri.js` | `app/src/renderer/character/CapriController.ts` | **Port & Adapt**| Port character state machine, window perch, edge peek, fall mechanics, teleportation, and alpha-map hit testing to modular TypeScript. |
| `src/renderer/js/fx.js` | `app/src/renderer/fx/FxLayer.ts` | **Port** | Port canvas-based shards, speed lines, lightning, teleport beams, shockwaves, and cut-in rendering. |
| `src/renderer/js/panel.js` | `app/src/renderer/ui/Panel.ts` | **Port & Adapt**| Port transmission panel, ticker, decode animations, and face swapping. Add approval prompt UI with diff viewer and action confirmation buttons. |
| `src/renderer/js/chip.js` | `app/src/renderer/character/Chip.ts` | **Port** | Vector mask renderer for sleeping state and bottom-left biochip stow mode. |
| `src/renderer/js/voice.js` | `app/src/renderer/audio/VoiceSynth.ts` | **Port** | Port Web Audio live synthesizer for sound effects (cues: teleport, done, alert, error, etc.) with custom sound override support. |
| `src/renderer/js/brain.js` | `app/src/renderer/events/EventDispatcher.ts` | **Adapt** | Adapt from parsing Claude webhook hooks to consuming validated protocol events from the Python brain over the WS bridge. |
| `src/renderer/js/lines.js` | `app/src/renderer/i18n/lines.ts` | **Port** | Multi-language string catalogs (RU/EN/FR/ES/PT) for character quips, tickers, and UI status badges. |
| `src/renderer/js/chat.js` | `app/src/renderer/ui/ChatView.ts` | **Adapt** | Render user chat input and streaming assistant responses, forwarding inputs to Python brain. |
| `src/renderer/js/mission.js` | `app/src/renderer/ui/MissionReport.ts` | **Port** | Daily mission report card generation and clipboard PNG export. |
| `src/renderer/styles/capri.css` | `app/src/renderer/styles/capri.css` | **Port** | Import exact palette variables, Chakra Petch + JetBrains Mono `@fontsource` rules with Cyrillic fallback, and panel styling. |
| `scripts/demo-sequence.js` | `app/src/renderer/demo/demoSequence.ts` | **Port** | Port full fake session event sequence (tools, edits, test failure, approval, success, showcase) for headless UI verification. |
| `tools/build-sprite.py` | `tools/build_sprite.py` | **Port** | Preserve as developer tool for regenerating `capri-full.png` sprite atlas with mirrored arms from source cut-outs if needed. |
| `seanyih/Capri` prompts | `brain/persona.py` | **Adapt** | Adopt the engram personality and tone (ironic, street-smart, teasing, proud) while strictly enforcing safety guardrails and engineering precision. |
