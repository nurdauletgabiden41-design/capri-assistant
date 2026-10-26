// Adapted from mochiiwuff/capri-desktop (MIT)

export class FxLayer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private cutinImages: Record<string, HTMLImageElement> = {};
  private activeCutin: { name: string; until: number } | null = null;

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

  public update(now: number): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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
      this.ctx.fillText(`⚡ CAPRI // ${name.toUpperCase()} ⚡`, cx + cutinW * 0.5, cy + cutinH * 0.5);
    }
    this.ctx.restore();
  }
}
