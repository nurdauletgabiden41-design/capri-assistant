// Adapted from mochiiwuff/capri-desktop (MIT)

/**
 * Vector mask rendering for sleeping state (closed eyes, wink)
 * and bottom-left biochip stow mode (put away).
 */

export const COLORS = {
  red: '#ff2152',
  green: '#36ff7a',
  ink: '#14101c',
  violet: '#7b3dff',
  paper: '#fff4f6',
  blue: '#3d6bff',
};

const MASK_POLY = {
  face: [[-48, -20], [-12, -22], [48, -26], [46, 20], [-45, 23]] as [number, number][],
  spike: [
    [-32, -20], [-37, -50], [-22, -63], [6, -67], [24, -75], [34, -99], [49, -90], [44, -66],
    [30, -48], [2, -42], [-10, -40], [-12, -21],
  ] as [number, number][],
  fang: [[-6, 22], [1, 27], [8, 22], [13, 26], [22, 21], [8, 52]] as [number, number][],
  eyes: [[-23, 0], [22, -3]] as [number, number][],
};

export function drawMask(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  {
    eyes = [1, 1],
    look = null,
    spike = true,
    flat = null,
  }: {
    eyes?: [number, number];
    look?: { x: number; y: number } | null;
    spike?: boolean;
    flat?: string | null;
  } = {}
): void {
  const poly = (pts: [number, number][], dx = 0, dy = 0) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
    ctx.closePath();
  };

  const shapes = spike ? [MASK_POLY.spike, MASK_POLY.face, MASK_POLY.fang] : [MASK_POLY.face, MASK_POLY.fang];

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineJoin = 'miter';

  // Violet misregistration copy
  for (const s of shapes) {
    poly(s, 3, 3);
    ctx.fillStyle = flat || COLORS.violet;
    ctx.fill();
  }

  if (flat) {
    for (const s of shapes) {
      poly(s);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (spike) {
    poly(MASK_POLY.spike);
    ctx.fillStyle = COLORS.green;
    ctx.fill();
  }

  poly(MASK_POLY.face);
  ctx.fillStyle = COLORS.green;
  ctx.fill();

  poly(MASK_POLY.fang);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();

  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  MASK_POLY.eyes.forEach(([ex, ey], i) => {
    const o = eyes[i];
    if (o < 0.15) {
      // Shut eye (chevron / sleepy curve)
      ctx.beginPath();
      ctx.moveTo(ex - 15, ey - 4);
      ctx.lineTo(ex, ey + 5);
      ctx.lineTo(ex + 15, ey - 4);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      return;
    }

    let px = 0;
    let py = 0;
    if (look) {
      const d = Math.hypot(look.x - (x + ex * k), look.y - (y + ey * k)) || 1;
      px = ((look.x - (x + ex * k)) / d) * 2.6;
      py = ((look.y - (y + ey * k)) / d) * 2.2;
    }

    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, o);
    ctx.beginPath();
    ctx.moveTo(-19, 0);
    ctx.quadraticCurveTo(0, -24, 19, 0);
    ctx.quadraticCurveTo(0, 24, -19, 0);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();

    const disk = (dx: number, dy: number, r: number, color: string) => {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    disk(px * 0.4, py * 0.4, 10.5, COLORS.green);
    disk(px * 0.4, py * 0.4, 8.8, COLORS.ink);
    disk(px * 0.7, py * 0.7, 7.6, COLORS.blue);

    ctx.beginPath();
    ctx.ellipse(px, py, 3, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();

    ctx.restore();
  });

  ctx.restore();
}

export class Chip {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public visible = false;
  public x = 30;
  public y = 30;
  public k = 0.5;
  public mode: 'idle' | 'work' | 'alert' | 'sleep' = 'idle';
  private peekUntil = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
  }

  public place(_screenW: number, screenH: number): void {
    // Bottom-left corner for stow mode
    this.x = 40;
    this.y = screenH - 60;
    this.canvas.width = 120;
    this.canvas.height = 120;
    this.canvas.style.transform = `translate(${this.x - 60}px, ${this.y - 60}px)`;
  }

  public show(): void {
    this.visible = true;
    this.canvas.hidden = false;
    this.draw();
  }

  public hide(): void {
    this.visible = false;
    this.canvas.hidden = true;
  }

  public draw(): void {
    if (!this.visible) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const now = performance.now();
    let eyes: [number, number] = [0, 0];

    // Occasionally crack one eye open (wink)
    if (now < this.peekUntil) {
      eyes = [0.4, 0];
    } else if (Math.random() < 0.02) {
      this.peekUntil = now + 900;
    }

    drawMask(this.ctx, 60, 60, this.k, { eyes, spike: true });
  }

  public contains(screenX: number, screenY: number): boolean {
    if (!this.visible) return false;
    return Math.hypot(screenX - this.x, screenY - this.y) < 45;
  }
}
