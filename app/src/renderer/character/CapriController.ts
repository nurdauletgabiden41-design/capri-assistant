// Adapted from mochiiwuff/capri-desktop (MIT)

import { ACTS, NEUTRAL, Player, Pose } from '../sprite/acting';
import { SPRITE, SpriteRenderer, SpriteState } from '../sprite/SpriteRenderer';

export type CharacterMode = 'idle' | 'work' | 'alert' | 'sleep' | 'offline';
export type CharacterStance = 'stand' | 'sit' | 'peek' | 'fall' | 'sleep';

export class CapriController {
  public root: HTMLElement;
  public canvas: HTMLCanvasElement;
  public renderer: SpriteRenderer;
  public pos = { x: 300, y: 500 };
  public facing: 1 | -1 = 1;
  public scale = 0.6;
  public mode: CharacterMode = 'offline';
  public stance: CharacterStance = 'stand';
  public isDragging = false;
  public isStowed = false;
  public isSleeping = false;
  public wander = true;

  private basePlayer: Player;
  private activeAct: Player | null = null;
  private alphaMap: Uint8ClampedArray | null = null;
  private lastDrawTime = 0;
  private lastActivityTime = performance.now();
  private nextWanderTime = performance.now() + 45000;
  private nextIdleTwitch = performance.now() + 6000;

  // Shader state uniforms
  private state: SpriteState = {
    seed: 0,
    boil: 0.9,
    hair: 0,
    head: 0,
    mane: 0,
    armL: 0,
    armR: 0,
    longL: 1,
    longR: 1,
    sit: 0,
    kickL: 0,
    kickR: 0,
    smear: [0, 0],
    echo: [0, 0],
    glitch: 0,
    glitchSeed: 0,
    split: 0,
    collapse: 0,
    dissolve: 0,
    sparkle: 1,
    grade: 1,
    sil: [0.08, 0.06, 0.11],
    silAmount: 0,
    misreg: [-2.6, 2.2],
    alpha: 1,
  };

  private bob = 0;
  private tilt = 0;
  private sx = 1;
  private sy = 1;

  public onMove?: (pos: { x: number; y: number }) => void;
  public onStateChange?: (mode: CharacterMode) => void;

  constructor(root: HTMLElement, canvas: HTMLCanvasElement, image: TexImageSource) {
    this.root = root;
    this.canvas = canvas;
    this.renderer = new SpriteRenderer(canvas, image);
    this.basePlayer = new Player('stand');
    this.buildAlphaMap(image);
    this.setScale(this.scale);
  }

  private buildAlphaMap(source: TexImageSource): void {
    const { width: w, height: h, mirror } = SPRITE;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(source as CanvasImageSource, 0, 0);
    const idata = ctx.getImageData(0, 0, w, h);
    const data = idata.data;

    // Mirror left reaching arm into right arm in alpha map
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!SPRITE.armL(x, y) || mirror - x >= w) continue;
        const to = (y * w + mirror - x) * 4 + 3;
        data[to] = Math.max(data[to], data[(y * w + x) * 4 + 3]);
      }
    }
    this.alphaMap = data;
  }

  public setScale(scale: number): void {
    this.scale = scale;
    this.renderer.resize(scale);
    this.place();
  }

  public setStance(stance: CharacterStance): void {
    if (this.stance === stance) return;
    this.stance = stance;
    this.basePlayer = new Player(stance);
    this.state.sit = stance === 'sit' ? 1 : 0;
  }

  public playAct(name: string, dir: number = 0): void {
    if (!ACTS[name]) return;
    const act = new Player(name, { dir, at: performance.now() });
    if (!this.activeAct || act.priority >= this.activeAct.priority) {
      this.activeAct = act;
    }
  }

  public touchActivity(): void {
    this.lastActivityTime = performance.now();
    if (this.isSleeping) {
      this.wake();
    }
  }

  public wake(): void {
    this.isSleeping = false;
    this.setStance('stand');
    this.playAct('hop');
  }

  public stow(): void {
    this.isStowed = true;
    this.root.style.display = 'none';
  }

  public unstow(): void {
    this.isStowed = false;
    this.root.style.display = 'block';
    this.playAct('hop');
    this.touchActivity();
  }

  public place(): void {
    const s = this.scale;
    const left = this.pos.x - (SPRITE.pad + SPRITE.feet.x) * s;
    const top = this.pos.y - (SPRITE.pad + SPRITE.feet.y) * s + this.bob;
    this.root.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    this.canvas.style.transform = `rotate(${this.tilt.toFixed(2)}deg) scale(${(this.facing * this.sx).toFixed(3)}, ${this.sy.toFixed(3)})`;
    this.onMove?.(this.pos);
  }

  public update(now: number): void {
    if (this.isStowed) return;

    // Check sleep timeout (10 quiet minutes = 600,000 ms)
    if (!this.isSleeping && now - this.lastActivityTime > 600000) {
      this.isSleeping = true;
      this.setStance('sleep');
    }

    // Determine target FPS: 24 fps if active act demands it, else 12 fps on twos
    const currentFps = this.activeAct?.act.fps || 12;
    const interval = 1000 / currentFps;
    if (now - this.lastDrawTime < interval) return;
    this.lastDrawTime = now;

    // Sample active act or base stance
    let sample = this.activeAct?.sample(now);
    if (!sample) {
      this.activeAct = null;
      sample = this.basePlayer.sample(now);
    }

    const pose: Pose = sample ? sample.pose : NEUTRAL;
    const resolved = this.activeAct
      ? this.activeAct.resolve(pose, this.facing)
      : this.basePlayer.resolve(pose, this.facing);

    this.applyPose(resolved, now);
    this.place();
    this.renderer.draw(this.state);

    // Idle flourishes & corner drifting
    if (!this.isDragging && !this.activeAct && this.stance === 'stand' && !this.isSleeping) {
      if (now > this.nextIdleTwitch) {
        this.nextIdleTwitch = now + 8000 + Math.random() * 8000;
        if (Math.random() < 0.4) this.playAct('curious', this.facing);
        else if (Math.random() < 0.3) this.playAct('look');
      }

      if (this.wander && now > this.nextWanderTime) {
        this.nextWanderTime = now + 45000 + Math.random() * 45000;
        this.driftToNewSpot();
      }
    }
  }

  private applyPose(pose: Pose, now: number): void {
    const s = this.state;
    s.seed = (now * 0.001) % 1000;
    s.boil = 0.85;

    s.head = pose.head ?? 0;
    s.mane = pose.mane ?? 0;
    s.hair = pose.hair ?? 0;
    s.armL = pose.armL ?? 0;
    s.armR = pose.armR ?? 0;
    s.longL = pose.longL ?? 1;
    s.longR = pose.longR ?? 1;
    s.kickL = pose.kickL ?? 0;
    s.kickR = pose.kickR ?? 0;
    s.smear = pose.smear ?? [0, 0];
    s.echo = pose.echo ?? [0, 0];

    this.bob = pose.bob ?? 0;
    this.tilt = pose.tilt ?? 0;
    this.sx = pose.sx ?? 1;
    this.sy = pose.sy ?? 1;

    // Offline state visual modifications
    if (this.mode === 'offline') {
      s.glitch = 0.45;
      s.glitchSeed = (now * 0.05) % 100;
      s.misreg = [-5.0, 4.0];
      s.grade = 0.2;
    } else {
      s.glitch = 0;
      s.misreg = [-2.6, 2.2];
      s.grade = 1;
    }
  }

  private driftToNewSpot(): void {
    // Pick another corner / spot on screen
    const targetX = Math.random() < 0.5 ? 180 : window.innerWidth - 220;
    this.facing = targetX < this.pos.x ? 1 : -1;
    this.pos.x = targetX;
    this.playAct('hop');
  }

  public hitTest(screenX: number, screenY: number): boolean {
    if (this.isStowed || !this.alphaMap) return false;

    const s = this.scale;
    const fy = this.pos.y + this.bob;
    const sx = SPRITE.feet.x + ((screenX - this.pos.x) / s) * this.facing;
    let sy = SPRITE.feet.y - (fy - screenY) / s;

    // Compensate sitting thigh fold
    if (this.state.sit > 0 && sy > SPRITE.hip) {
      const c = 0.3;
      sy = sy <= SPRITE.hip + 73 * c ? SPRITE.hip + (sy - SPRITE.hip) / c : sy + 73 * (1 - c);
    }

    const px = Math.round(sx);
    const py = Math.round(sy);

    if (px < 0 || px >= SPRITE.width || py < 0 || py >= SPRITE.height) {
      return false;
    }

    const alpha = this.alphaMap[(py * SPRITE.width + px) * 4 + 3];
    return alpha > 40;
  }
}
