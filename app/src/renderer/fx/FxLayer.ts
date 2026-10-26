// Adapted from mochiiwuff/capri-desktop (MIT)

export interface FxPoint {
  x: number;
  y: number;
}

interface Shard {
  type: 'shard';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  birth: number;
  life: number;
}

interface Bolt {
  type: 'bolt';
  from: FxPoint | (() => FxPoint);
  to: FxPoint | (() => FxPoint);
  pts: [number, number][];
  forks: [number, number][][];
  width: number;
  birth: number;
  life: number;
}

interface Ring {
  type: 'ring';
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  birth: number;
  life: number;
}

type FxItem = Shard | Bolt | Ring;

export class FxLayer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private cutinImages: Record<string, HTMLImageElement> = {};
  private activeCutin: { name: string; until: number } | null = null;
  private items: FxItem[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for FxLayer');
    this.ctx = ctx;
    this.resize(window.innerWidth, window.innerHeight);
  }

  public resize(w: number, h: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public async loadCutin(name: string, src: string): Promise<void> {
    const img = new Image();
    img.src = src;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // Graceful skip if file not present
    });
    if (img.complete && img.naturalWidth > 0) {
      this.cutinImages[name] = img;
    }
  }

  public showCutin(name: string, durationMs: number = 800): void {
    this.activeCutin = {
      name,
      until: performance.now() + durationMs,
    };
  }

  public burst(
    x: number,
    y: number,
    opts: { count?: number; power?: number; spread?: number } = {}
  ): void {
    const count = opts.count ?? 18;
    const power = opts.power ?? 1;
    const spread = opts.spread ?? 50;
    const now = performance.now();
    const colors = ['#ff2152', '#36ff7a', '#7b3dff', '#fff4f6'];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (180 + Math.random() * 420) * power;
      this.items.push({
        type: 'shard',
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 12,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        birth: now,
        life: 250 + Math.random() * 350,
      });
    }
  }

  public bolt(
    from: FxPoint | (() => FxPoint),
    to: FxPoint | (() => FxPoint),
    opts: { life?: number; forks?: number; width?: number } = {}
  ): void {
    const life = opts.life ?? 240;
    const width = opts.width ?? 3;
    const forksCount = opts.forks ?? 2;
    const p1 = typeof from === 'function' ? from() : from;
    const p2 = typeof to === 'function' ? to() : to;

    const pts = this.generateJaggedLine(p1, p2, 28);
    const forks: [number, number][][] = [];

    for (let f = 0; f < forksCount; f++) {
      const midIdx = Math.floor(pts.length * (0.3 + Math.random() * 0.4));
      const start = pts[midIdx];
      const end: FxPoint = {
        x: start[0] + (Math.random() - 0.5) * 140,
        y: start[1] + (Math.random() - 0.5) * 140,
      };
      forks.push(this.generateJaggedLine({ x: start[0], y: start[1] }, end, 16));
    }

    this.items.push({
      type: 'bolt',
      from,
      to,
      pts,
      forks,
      width,
      birth: performance.now(),
      life,
    });
  }

  public ring(
    x: number,
    y: number,
    opts: { size?: number; life?: number; color?: string } = {}
  ): void {
    const size = opts.size ?? 1;
    const life = opts.life ?? 320;
    const color = opts.color ?? '#36ff7a';

    this.items.push({
      type: 'ring',
      x,
      y,
      radius: 4,
      maxRadius: 80 * size,
      color,
      birth: performance.now(),
      life,
    });
  }

  private generateJaggedLine(
    a: FxPoint,
    b: FxPoint,
    jitter: number
  ): [number, number][] {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const segments = Math.max(4, Math.round(len / 22));
    const pts: [number, number][] = [];

    let side = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let offset = 0;
      if (i > 0 && i < segments) {
        if (Math.random() < 0.75) side = -side;
        offset = side * (0.3 + Math.random() * 0.7) * jitter;
      }
      pts.push([
        a.x + (b.x - a.x) * t + nx * offset,
        a.y + (b.y - a.y) * t + ny * offset,
      ]);
    }
    return pts;
  }

  public update(now: number): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Update and draw items (bolts, shards, rings)
    const alive: FxItem[] = [];
    const dt = 0.016; // approximate frame delta

    for (const item of this.items) {
      const age = now - item.birth;
      if (age >= item.life) continue;
      alive.push(item);
      const progress = age / item.life;

      if (item.type === 'shard') {
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.rot += item.vr * dt;
        const alpha = 1 - progress;

        this.ctx.save();
        this.ctx.translate(item.x, item.y);
        this.ctx.rotate(item.rot);
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = item.color;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -item.size);
        this.ctx.lineTo(item.size * 0.7, item.size * 0.6);
        this.ctx.lineTo(-item.size * 0.7, item.size * 0.6);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
      } else if (item.type === 'bolt') {
        const alpha = Math.max(0, 1 - progress * 1.2);
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.lineJoin = 'miter';

        // Draw shadow (violet misregistration)
        this.drawStroke(item.pts, '#7b3dff', item.width + 4, 3, 3);
        // Draw red casing
        this.drawStroke(item.pts, '#ff2152', item.width + 2);
        // Draw core white lightning
        this.drawStroke(item.pts, '#fff4f6', Math.max(1, item.width * 0.5));

        for (const fork of item.forks) {
          this.drawStroke(fork, '#ff2152', item.width);
          this.drawStroke(fork, '#fff4f6', 1);
        }
        this.ctx.restore();
      } else if (item.type === 'ring') {
        const r = item.radius + (item.maxRadius - item.radius) * progress;
        const alpha = 1 - progress;

        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.strokeStyle = item.color;
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
        this.ctx.stroke();

        // Violet misregistered echo ring
        this.ctx.strokeStyle = '#7b3dff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(item.x + 2, item.y + 2, r, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
    this.items = alive;

    // 2. Draw active Cutin if present
    if (!this.activeCutin) return;
    if (now > this.activeCutin.until) {
      this.activeCutin = null;
      return;
    }

    const { name } = this.activeCutin;
    const img = this.cutinImages[name];
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Draw manga speedlines across screen
    this.ctx.save();
    this.ctx.strokeStyle = '#ff2152';
    this.ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const y = (now * 0.2 + i * 70) % h;
      this.ctx.beginPath();
      this.ctx.moveTo(w * 0.3, y);
      this.ctx.lineTo(w * 0.7, y + (i % 2 === 0 ? 10 : -10));
      this.ctx.stroke();
    }
    this.ctx.restore();

    // Draw cutin banner
    const cutinW = 360;
    const cutinH = 240;
    const cx = (w - cutinW) * 0.5;
    const cy = (h - cutinH) * 0.35;

    this.ctx.save();
    // Violet misregistration
    this.ctx.fillStyle = '#7b3dff';
    this.ctx.fillRect(cx + 6, cy + 6, cutinW, cutinH);

    // Dark frame
    this.ctx.fillStyle = '#14101c';
    this.ctx.fillRect(cx, cy, cutinW, cutinH);
    this.ctx.strokeStyle = '#36ff7a';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(cx, cy, cutinW, cutinH);

    if (img) {
      this.ctx.drawImage(img, cx, cy, cutinW, cutinH);
    } else {
      // Procedural fallback graphic
      this.ctx.fillStyle = '#ff2152';
      this.ctx.font = 'bold 24px "Chakra Petch", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        `⚡ CAPRI // ${name.toUpperCase()} ⚡`,
        cx + cutinW * 0.5,
        cy + cutinH * 0.5
      );
    }
    this.ctx.restore();
  }

  private drawStroke(
    pts: [number, number][],
    color: string,
    width: number,
    dx: number = 0,
    dy: number = 0
  ): void {
    if (pts.length < 2) return;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    for (let i = 1; i < pts.length; i++) {
      this.ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
    }
    this.ctx.stroke();
  }
}
