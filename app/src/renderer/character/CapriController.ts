// Adapted from mochiiwuff/capri-desktop (MIT)

import type { FxLayer } from '../fx/FxLayer';
import { ACTS, NEUTRAL, Player, Pose } from '../sprite/acting';
import { SPRITE, SpriteRenderer, SpriteState } from '../sprite/SpriteRenderer';

export type CharacterMode = 'idle' | 'work' | 'alert' | 'sleep' | 'offline';
export type CharacterStance = 'stand' | 'sit' | 'peek' | 'fall' | 'sleep';

export interface WindowRect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  max: boolean;
}

export interface WindowData {
  fg: number;
  wins: WindowRect[];
}

const GRAVITY = 2600; // px/s^2
const MAX_FALL_SPEED = 1900; // px/s
const THIGH = 73; // hip to knee sprite px

export class CapriController {
  public root: HTMLElement;
  public canvas: HTMLCanvasElement;
  public renderer: SpriteRenderer;
  public fx?: FxLayer;

  public pos = { x: 300, y: 500 };
  public facing: 1 | -1 = 1;
  public scale = 0.6;
  public mode: CharacterMode = 'offline';
  public stance: CharacterStance = 'stand';
  public perch: { id: number | 'taskbar'; dx: number } | null = null;
  public peekSide: 'left' | 'right' | 'top' | null = null;
  public upside = false;

  public isDragging = false;
  public isStowed = false;
  public isSleeping = false;
  public isBusy = false;
  public wander = true;
  public zapEnabled = true;

  public windows: WindowData = { fg: 0, wins: [] };

  private basePlayer: Player;
  private activeAct: Player | null = null;
  private alphaMap: Uint8ClampedArray | null = null;

  private lastDrawTime = 0;
  private lastActivityTime = performance.now();
  private nextWanderTime = performance.now() + 40000;
  private nextIdleTwitch = performance.now() + 6000;
  private nextNoticeTime = 0;
  private peekUntil = 0;
  private peekFrom: { x: number; y: number } | null = null;

  // Falling physics
  private vy = 0;
  private lastFallTime = 0;
  private landingSpot: {
    y: number;
    stance: CharacterStance;
    perch: { id: number | 'taskbar'; dx: number } | null;
  } | null = null;

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
  public onSpeakLine?: (line: string) => void;

  constructor(
    root: HTMLElement,
    canvas: HTMLCanvasElement,
    image: TexImageSource,
    fx?: FxLayer
  ) {
    this.root = root;
    this.canvas = canvas;
    this.fx = fx;
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

  public get floor(): number {
    return window.innerHeight - 10;
  }

  public setScale(scale: number): void {
    this.scale = scale;
    this.renderer.resize(scale);
    this.place();
  }

  public setWindows(data: WindowData): void {
    this.windows = data;
    if (this.stance !== 'sit' || this.isBusy || this.isDragging) return;

    const perchId = this.perch?.id;
    if (!perchId) return;

    const win = this.perchWin(perchId);
    const dx = win ? Math.min(Math.max(this.perch!.dx, 50), win.w - 60) : 0;

    if (!win || !this.canSit(win) || this.covered(win, win.x + dx)) {
      this.fall(); // window closed, minimized, maximized or covered
      return;
    }

    const to = this.seat(win, dx);
    if (to.x !== this.pos.x || to.y !== this.pos.y) {
      this.pos = to; // ride along with window movement
      this.place();
    }
  }

  public canSit(win: WindowRect): boolean {
    if ((win as any).id === 'taskbar') return true;
    const roomAbove = SPRITE.hip * this.scale + 12;
    return (
      !win.max &&
      win.w > 240 &&
      win.y > roomAbove &&
      win.y < this.floor - 80
    );
  }

  public covered(win: WindowRect, x: number): boolean {
    if ((win as any).id === 'taskbar') return false;
    const half = 34 * this.scale;
    for (const o of this.windows.wins) {
      if (o === win || o.id === win.id) return false; // reached window in z-order
      if (
        o.x < x + half &&
        o.x + o.w > x - half &&
        o.y <= win.y &&
        o.y + o.h >= win.y
      ) {
        return true;
      }
    }
    return false;
  }

  public seat(win: WindowRect, dx: number): { x: number; y: number } {
    return {
      x: win.x + dx,
      y: win.y + 3 + (SPRITE.feet.y - SPRITE.hip) * this.scale,
    };
  }

  public perchWin(id: number | 'taskbar'): WindowRect | null {
    if (id === 'taskbar') {
      return {
        id: 'taskbar' as any,
        x: 0,
        y: this.floor,
        w: window.innerWidth,
        h: 48,
        max: false,
      };
    }
    return this.windows.wins.find((w) => w.id === id) || null;
  }

  public pickSeat(opts: { frontOnly?: boolean; except?: number } = {}): {
    win: WindowRect;
    dx: number;
  } | null {
    const options: { win: WindowRect; dx: number }[] = [];
    for (const win of this.windows.wins) {
      if (win.id === opts.except || !this.canSit(win)) continue;
      const dx = Math.min(
        Math.max(win.w * 0.35, 60),
        Math.max(60, win.w - 180)
      );
      if (this.covered(win, win.x + dx)) continue;
      options.push({ win, dx });
    }

    const front = options.find((o) => o.win.id === this.windows.fg);
    if (opts.frontOnly) return front || null;
    return front || options[0] || null;
  }

  public async sitOn(target: { win: WindowRect; dx: number }): Promise<void> {
    const to = this.seat(target.win, target.dx);
    await this.teleport(to, {
      stance: 'sit',
      perch: { id: target.win.id, dx: target.dx },
    });
  }

  public setStance(
    stance: CharacterStance,
    opts: {
      perch?: { id: number | 'taskbar'; dx: number } | null;
      peekSide?: 'left' | 'right' | 'top' | null;
    } = {}
  ): void {
    this.stance = stance;
    this.perch = opts.perch ?? null;
    this.peekSide = opts.peekSide ?? null;
    this.upside = stance === 'peek' && this.peekSide === 'top';
    this.state.sit = stance === 'sit' ? 1 : 0;
    this.basePlayer = new Player(stance === 'peek' ? 'stand' : stance);
  }

  public playAct(name: string, dir: number = 0): void {
    if (!ACTS[name]) return;
    const act = new Player(name, { dir, at: performance.now() });
    if (!this.activeAct || act.priority >= this.activeAct.priority) {
      this.activeAct = act;
    }
  }

  // --- Falling Mechanics ---

  public fall(): void {
    if (this.stance === 'fall') return;
    this.landingSpot = this.landing();
    this.setStance('fall');
    this.vy = 0;
    this.lastFallTime = performance.now();
  }

  public landing(): {
    y: number;
    stance: CharacterStance;
    perch: { id: number | 'taskbar'; dx: number } | null;
  } {
    const hip = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * this.scale;
    let best: WindowRect | null = null;

    for (const win of this.windows.wins) {
      if (!this.canSit(win) || win.y < hip - 4) continue;
      if (this.pos.x < win.x + 40 || this.pos.x > win.x + win.w - 40) continue;
      if (this.covered(win, this.pos.x)) continue;
      if (!best || win.y < best.y) best = win;
    }

    if (best) {
      const dx = this.pos.x - best.x;
      return {
        y: this.seat(best, dx).y,
        stance: 'sit',
        perch: { id: best.id, dx },
      };
    }
    return { y: this.floor, stance: 'stand', perch: null };
  }

  public updateFall(now: number): void {
    if (!this.landingSpot) this.landingSpot = this.landing();
    const target = this.landingSpot;
    const dt = Math.min(0.05, (now - this.lastFallTime) / 1000);
    this.lastFallTime = now;

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);
    const nextY = this.pos.y + this.vy * dt;

    if (nextY < target.y) {
      this.pos.y = nextY;
      // Air stretch
      this.sy = 1.18;
      this.sx = 0.88;
      this.place();
      return;
    }

    // Impact / Landing
    this.pos.y = target.y;
    this.setStance(target.stance, { perch: target.perch });
    this.sy = 1;
    this.sx = 1;
    this.place();

    const s = this.scale;
    if (target.stance === 'sit') {
      this.playAct('hop'); // plop onto ledge
      this.fx?.burst(this.pos.x, this.pos.y - 30 * s, { count: 8, spread: 30 });
    } else {
      this.playAct('land');
      this.fx?.burst(this.pos.x, this.pos.y - 20 * s, { count: 18, power: 0.8, spread: 60 * s });
      this.fx?.ring(this.pos.x, this.pos.y - 10, { size: 0.6 });
    }

    // Subtle impact glitch
    this.state.glitch = 0.3;
    this.state.glitchSeed = Math.random() * 100;
    setTimeout(() => {
      this.state.glitch = 0;
    }, 120);
  }

  // --- Peeking from screen edges ---

  public async peek(side: 'left' | 'right' | 'top' = 'right'): Promise<void> {
    if (this.isBusy) return;
    this.isBusy = true;
    const s = this.scale;
    const w = window.innerWidth;
    const h = window.innerHeight;

    let at: { x: number; y: number };
    let from: { x: number; y: number };
    let facing: 1 | -1;

    if (side === 'left') {
      facing = -1;
      at = { x: 30 * s, y: h * 0.7 };
      from = { x: -180 * s, y: h * 0.7 };
    } else if (side === 'right') {
      facing = 1;
      at = { x: w - 30 * s, y: h * 0.7 };
      from = { x: w + 180 * s, y: h * 0.7 };
    } else {
      // Top upside-down peek
      facing = 1;
      at = { x: w * 0.5, y: -220 * s };
      from = { x: w * 0.5, y: -450 * s };
    }

    this.pos = { ...from };
    this.facing = facing;
    this.setStance('peek', { peekSide: side });
    this.peekFrom = from;
    this.peekUntil = performance.now() + 20000;

    // Slide in on twos
    this.pos = at;
    this.place();
    this.isBusy = false;
  }

  public async unpeek(opts: { shy?: boolean } = {}): Promise<void> {
    if (this.isBusy || this.stance !== 'peek') return;
    this.isBusy = true;

    if (this.peekFrom) {
      this.pos = { ...this.peekFrom };
      this.place();
    }

    const side = this.peekSide;
    this.setStance('stand');

    if (opts.shy && Math.random() < 0.5) {
      this.isBusy = false;
      const otherSide = side === 'left' ? 'right' : side === 'right' ? 'top' : 'left';
      this.peek(otherSide);
      return;
    }

    const seat = this.wander ? this.pickSeat() : null;
    if (seat) {
      await this.sitOn(seat);
    } else {
      await this.teleport({
        x: window.innerWidth - 220,
        y: this.floor,
      });
    }
    this.isBusy = false;
  }

  // --- Interaction & Reactions ---

  public notice(x: number, y: number): void {
    if (this.isBusy || this.isStowed || this.stance === 'fall') return;

    const headX = this.pos.x;
    const headY = this.pos.y - 320 * this.scale;
    const dist = Math.hypot(x - headX, y - headY);

    if (dist > 230) return;

    const now = performance.now();
    this.touchActivity();

    if (now < this.nextNoticeTime) return;
    this.nextNoticeTime = now + 12000;

    if (this.stance === 'peek') {
      this.unpeek({ shy: true });
      return;
    }

    const wantedFacing = x < this.pos.x ? 1 : -1;
    if (wantedFacing !== this.facing && this.stance === 'stand') {
      this.facing = wantedFacing;
      this.playAct('turn');
      return;
    }

    if (this.mode !== 'idle') return;

    // Chance to zap cursor with lightning
    if (this.zapEnabled && Math.random() < 0.35) {
      this.zap(x, y);
      return;
    }

    this.playAct('curious', wantedFacing);
  }

  public zap(x: number, y: number): boolean {
    if (this.isBusy || this.stance !== 'stand' || !this.fx) return false;

    const s = this.scale;
    const hand: { x: number; y: number } = {
      x: this.pos.x - 40 * s * this.facing,
      y: this.pos.y - 210 * s,
    };

    this.playAct('point', x < this.pos.x ? -1 : 1);
    this.fx.bolt(hand, { x, y }, { life: 260, forks: 2, width: 3 });
    this.fx.burst(x, y, { count: 8, power: 0.4, spread: 20 });
    this.fx.ring(x, y, { size: 0.35, color: '#ff2152' });

    setTimeout(() => {
      this.playAct('hop');
    }, 300);
    return true;
  }

  public drop(): void {
    const s = this.scale;
    const hip = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * s;

    for (const win of this.windows.wins) {
      if (!this.canSit(win) || Math.abs(hip - win.y) > 30) continue;
      if (
        this.pos.x < win.x + 40 ||
        this.pos.x > win.x + win.w - 40 ||
        this.covered(win, this.pos.x)
      ) {
        continue;
      }

      const dx = this.pos.x - win.x;
      this.pos = this.seat(win, dx);
      this.setStance('sit', { perch: { id: win.id, dx } });
      this.playAct('hop');
      this.fx?.burst(this.pos.x, this.pos.y - 30 * s, { count: 8, spread: 30 });
      return;
    }

    if (this.pos.y < this.floor - 4) {
      this.fall();
    } else {
      this.playAct('land');
    }
  }

  public async teleport(
    to: { x: number; y: number },
    opts: {
      stance?: CharacterStance;
      perch?: { id: number | 'taskbar'; dx: number } | null;
      facing?: 1 | -1;
    } = {}
  ): Promise<void> {
    if (this.isStowed) return;
    this.isBusy = true;
    this.wake();

    const fromHead = {
      x: this.pos.x,
      y: this.pos.y - 320 * this.scale,
    };

    // Vanish effects
    this.state.glitch = 0.4;
    this.state.split = 4;
    this.fx?.burst(fromHead.x, fromHead.y, { count: 14, spread: 50 });
    await new Promise((r) => setTimeout(r, 120));

    // Teleport arrival
    this.pos = { ...to };
    this.facing = opts.facing ?? (to.x > window.innerWidth / 2 ? 1 : -1);
    this.setStance(opts.stance ?? 'stand', { perch: opts.perch });
    this.place();

    const toHead = {
      x: this.pos.x,
      y: this.pos.y - 320 * this.scale,
    };
    this.fx?.bolt(fromHead, toHead, { life: 200, forks: 1, width: 3 });
    this.fx?.burst(toHead.x, toHead.y, { count: 16, power: 0.7, spread: 70 });
    this.fx?.ring(toHead.x, toHead.y, { size: 0.5 });

    this.state.glitch = 0;
    this.state.split = 0;
    this.isBusy = false;
  }

  public goToWork(): void {
    this.mode = 'work';
    const seat = this.pickSeat({ frontOnly: true });
    if (seat) {
      if (this.stance === 'sit' && this.perch?.id === seat.win.id) return;
      this.sitOn(seat);
      return;
    }

    // Otherwise settle on corner
    const targetX = window.innerWidth - 220;
    if (this.stance !== 'stand' || Math.abs(this.pos.x - targetX) > 300) {
      this.teleport({ x: targetX, y: this.floor });
    }
  }

  public doubleClick(): void {
    const lines = [
      'Эй, щекотно же!',
      'Полегче с курсором~',
      'Уже перелетаю!',
      'Осторожно, конструкт под напряжением!',
    ];
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.onSpeakLine?.(line);

    this.playAct('flinch');
    setTimeout(() => {
      const seat = this.pickSeat({ except: typeof this.perch?.id === 'number' ? this.perch.id : undefined });
      if (seat) {
        this.sitOn(seat);
      } else {
        const otherCorner = this.pos.x > window.innerWidth / 2 ? 220 : window.innerWidth - 220;
        this.teleport({ x: otherCorner, y: this.floor });
      }
    }, 350);
  }

  public touchActivity(): void {
    this.lastActivityTime = performance.now();
    if (this.isSleeping) {
      this.wake();
    }
  }

  public wake(): void {
    this.isSleeping = false;
    if (this.stance === 'sleep') {
      this.setStance('stand');
      this.playAct('hop');
    }
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

    const flipY = this.upside ? -1 : 1;
    this.canvas.style.transform = `rotate(${this.tilt.toFixed(2)}deg) scale(${(this.facing * this.sx).toFixed(3)}, ${(flipY * this.sy).toFixed(3)})`;
    this.onMove?.(this.pos);
  }

  public update(now: number): void {
    if (this.isStowed) return;

    // Check sleep timeout (10 quiet minutes = 600,000 ms)
    if (!this.isSleeping && now - this.lastActivityTime > 600000) {
      this.isSleeping = true;
      this.setStance('sleep');
    }

    // Falling physics update
    if (this.stance === 'fall') {
      this.updateFall(now);
      this.place();
      this.renderer.draw(this.state);
      return;
    }

    // Determine target FPS: 24 fps if active act demands it, else 12 fps on twos
    const currentFps = this.activeAct?.act.fps || 12;
    const interval = 1000 / currentFps;
    if (now - this.lastDrawTime < interval) return;
    this.lastDrawTime = now;

    // Check peek expiration
    if (this.stance === 'peek' && now > this.peekUntil) {
      this.unpeek();
    }

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

    // Idle flourishes, window wandering & peeking
    if (
      !this.isDragging &&
      !this.activeAct &&
      !this.isSleeping &&
      !this.isBusy &&
      this.mode === 'idle'
    ) {
      if (now > this.nextIdleTwitch) {
        this.nextIdleTwitch = now + 8000 + Math.random() * 8000;
        if (Math.random() < 0.4) this.playAct('curious', this.facing);
        else if (Math.random() < 0.3) this.playAct('look');
      }

      if (this.wander && now > this.nextWanderTime) {
        this.nextWanderTime = now + 45000 + Math.random() * 45000;
        this.wanderStep();
      }
    }
  }

  private wanderStep(): void {
    const r = Math.random();
    const seat = this.pickSeat();

    if (this.stance === 'sit') {
      if (r < 0.35) this.playAct('look');
      else if (r < 0.65) this.fall(); // hops off ledge
      else this.teleport(this.spot('random'));
      return;
    }

    if (seat && r < 0.4) {
      this.sitOn(seat);
    } else if (r < 0.65) {
      this.peek(Math.random() < 0.33 ? 'left' : Math.random() < 0.5 ? 'right' : 'top');
    } else {
      this.teleport(this.spot('random'));
    }
  }

  public spot(name: 'post' | 'random'): { x: number; y: number } {
    if (name === 'post') {
      return { x: window.innerWidth - 220, y: this.floor };
    }
    const x = 180 + Math.random() * (window.innerWidth - 360);
    const y = Math.random() < 0.6 ? this.floor : 240 + Math.random() * (this.floor - 300);
    return { x, y };
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

  public hitTest(screenX: number, screenY: number): boolean {
    if (this.isStowed || !this.alphaMap) return false;

    const s = this.scale;
    const fy = this.pos.y + this.bob;
    const sx = SPRITE.feet.x + ((screenX - this.pos.x) / s) * this.facing;
    let sy = SPRITE.feet.y - (fy - screenY) / s;

    // Compensate sitting thigh fold
    if (this.state.sit > 0 && sy > SPRITE.hip) {
      const c = 0.3;
      sy = sy <= SPRITE.hip + THIGH * c ? SPRITE.hip + (sy - SPRITE.hip) / c : sy + THIGH * (1 - c);
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
