# Capri: Assets Registry & Media Specification

This document inventories all visual media assets required by **Capri**, specifying their dimensions, file formats, functional purpose in the rendering pipeline, licensing origin, and graceful fallback behavior.

---

## 1. Asset Registry Overview

All media assets are categorized into:
1. **Core Character Rig & Texture Atlas:** Used by the WebGL fragment shader (`SpriteRenderer`).
2. **Transmission Panel Faces:** Displayed in the portrait frame of the transmission panel during speech and actions.
3. **Manga Cut-In Banners:** 2D anime cut-ins rendered over speed lines during significant moments (victory, approval alerts, pointing).
4. **Intro Screen-Grab Cels:** High-resolution cels for the cinematic screen-grab opening sequence.
5. **System Icons:** Tray and application icons for Windows 11.

---

## 2. Comprehensive Assets Table

| Asset Name | Format | Dimensions (px) | File Size | Functional Purpose | Origin | License & Classification |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| `capri-full.png` | PNG | 240 × 420 | 73.9 KB | Primary sprite texture for WebGL quad rig. Contains torso, head, mane, left reaching arm; hanging arm removed so right arm is generated via shader mirroring. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan cut-out). Personal use only. In `.gitignore`. |
| `capri-cutout.png` | PNG | 220 × 420 | 77.1 KB | Raw cut-out source before arm processing via `build_sprite.py`. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan cut-out). Personal use only. In `.gitignore`. |
| `capri-face.png` | PNG | 256 × 256 | 89.8 KB | Panel portrait: signature zigzag grin (`grin`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-calm.png` | PNG | 256 × 256 | 86.7 KB | Panel portrait: mouth closed, watching attentively (`calm`, `idle`, `work`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-aside.png` | PNG | 256 × 256 | 84.6 KB | Panel portrait: turned away, thinking, sighing (`aside`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-smug.png` | PNG | 256 × 256 | 91.5 KB | Panel portrait: sly fang grin, head cocked (`smug`, `report`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-wide.png` | PNG | 256 × 256 | 95.7 KB | Panel portrait: round eyes, surprised (`wide`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-look.png` | PNG | 256 × 256 | 95.7 KB | Panel portrait: direct gaze at the user (`look`, `done`, `chat`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-laugh.png` | PNG | 256 × 256 | 83.5 KB | Panel portrait: wide-open manic laugh (`laugh`, `error`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `face-many.png` | PNG | 256 × 256 | 84.4 KB | Panel portrait: all multiple construct eyes open (`many`, `alert`). | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `cutin-grin.png` | PNG | 360 × 240 | 115.9 KB | Screen cut-in banner during teasing or minor success. | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `cutin-laugh.png`| PNG | 360 × 240 | 106.3 KB | Screen cut-in banner during major task victory laugh. | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `cutin-eyes.png` | PNG | 360 × 240 | 115.8 KB | Screen cut-in banner before satellite launch or pointing lock. | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `cutin-many.png` | PNG | 360 × 240 | 97.7 KB | Screen cut-in banner when approval prompt is displayed. | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `cutin-look.png` | PNG | 360 × 240 | 118.6 KB | Screen cut-in banner during pointer zap or intense focus. | `reference/capri-desktop/assets/capri/` | Non-MIT (Show frame). Personal use only. In `.gitignore`. |
| `intro-grab.webp`| WebP| 1672 × 941 | 163.3 KB | Screen grab base: Capri's hands gripping desktop borders. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-happy.webp`| WebP| 1672 × 941| 160.0 KB | Intro sequence: eyes shut with joy during arrival. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-mouth1.webp`| WebP| 1672 × 941| 163.3 KB | Intro cel: mouth slightly open. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-mouth2.webp`| WebP| 1672 × 941| 163.3 KB | Intro cel: mouth half open. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-mouth3.webp`| WebP| 1672 × 941| 163.5 KB | Intro cel: mouth wide open ("hi!"). | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-smear.webp`| WebP| 1672 × 941| 180.8 KB | Intro cel: hand release motion smear. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-wave1.webp`| WebP| 1672 × 941| 183.0 KB | Intro cel: waving hand tilted left. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-wave2.webp`| WebP| 1672 × 941| 186.2 KB | Intro cel: waving hand tilted right. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `intro-wave3.webp`| WebP| 1672 × 941| 179.3 KB | Intro cel: waving claw vertical. | `reference/capri-desktop/assets/capri/` | Non-MIT (Fan art cut-out). Personal use only. In `.gitignore`. |
| `tray.png` | PNG | 32 × 32 | 3.4 KB | Windows system tray taskbar notification icon. | `reference/capri-desktop/assets/icons/` | Public domain / MIT. |
| `capri.png` | PNG | 256 × 256 | 102.6 KB | High-resolution application icon. | `reference/capri-desktop/assets/icons/` | Public domain / MIT. |
| `capri.ico` | ICO | Multi-res (16-256) | 166.4 KB | Windows executable icon bundle. | `reference/capri-desktop/assets/icons/` | Public domain / MIT. |

---

## 3. Fonts (Bundled Locally via Fontsource)

No fonts are fetched from external CDNs or Google Fonts servers. Fonts are bundled strictly locally:
- **Chakra Petch (SemiBold 600, Bold 700):** Beveled cyberpunk header typography. Latin character set.
- **JetBrains Mono (Regular 400, SemiBold 600):** Data ticker, code diffs, logs. Latin character set.
- **JetBrains Mono (Cyrillic 400, 600):** Substituted via CSS `unicode-range` (`U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116`) as fallback for Russian text where Chakra Petch lacks Cyrillic glyphs.

---

## 4. Graceful Fallback Strategy (When Character Assets Are Missing)

Because `app/assets/capri/` is excluded via `.gitignore` and must never be distributed publicly, the application includes a **graceful procedural fallback subsystem**:

1. **Character Sprite Fallback (`SpriteRenderer`):**
   - If `capri-full.png` fails to load, the renderer dynamically synthesizes a 240×420 placeholder canvas containing:
     - Vector silhouette of Capri's head, spiked mane, and stylized construct body in glowing neon green (`#36ff7a`) and violet (`#7b3dff`).
     - Procedurally rendered eyes that track cursor position.
   - The WebGL texture loads this procedural canvas, allowing the full shader pipeline (head tilt, mane flare, sitting foreshortening, and glitch slices) to execute with zero runtime errors.

2. **Panel Portrait Fallback (`Panel`):**
   - If facial expression PNGs are absent, the panel portrait displays the vector biochip mask (`drawMask`) with corresponding mood modifications:
     - `calm`: Standard eyes open, neutral fang.
     - `smug`: One eye squinted, fang raised.
     - `laugh`: Mouth fang lowered with wide cyan iris rings.
     - `many`: 4 concentric construct eyes rendered on the mask face.
     - `alert`: Red construct warning tint.

3. **Cut-Ins Fallback (`FxLayer`):**
   - If cut-in PNGs are missing, the cut-in sequence renders high-contrast geometric manga speed-lines with bold glowing Kanji/Cyberpunk data glyphs (`▞▚ ALERT // CAPRI`) rather than failing.

4. **Intro Sequence Fallback:**
   - If intro WebP frames are absent, Capri gracefully transitions directly to her signature lightning column teleport entrance (`teleport-in`) to initialize her presence on the screen.
