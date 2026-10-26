/**
 * SpriteController manages the character canvas, animation timing (12 fps on twos),
 * pixel-precise hit-testing alpha map, position updates, and offline construct visual state.
 */

export interface Position {
  x: number;
  y: number;
}

export class SpriteController {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public pos: Position = { x: 300, y: 400 };
  public scale: number = 0.6;
  public facing: number = 1; // 1 or -1
  public isOnline: boolean = false;
  public isDragging: boolean = false;

  private image: HTMLImageElement | null = null;
  private alphaMap: Uint8ClampedArray | null = null;
  private spriteWidth: number = 240;
  private spriteHeight: number = 420;
  private pad: number = 56;

  // 4-drawing idle float bob offsets (on twos)
  private floatFrames: number[] = [0, -3, -6, -3];
  private currentFrameIndex: number = 0;
  private lastDrawTime: number = 0;
  private fpsInterval: number = 1000 / 12; // 12 fps on twos

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
  }

  public async init(imagePath?: string): Promise<void> {
    if (imagePath) {
      try {
        const img = new Image();
        img.src = imagePath;
        await new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = reject;
        });
        this.image = img;
        this.spriteWidth = img.width;
        this.spriteHeight = img.height;
        this.buildAlphaMap(img);
      } catch (err) {
        console.warn('[sprite] Image load failed, using procedural fallback:', err);
        this.buildProceduralFallback();
      }
    } else {
      this.buildProceduralFallback();
    }

    this.resizeCanvas();
  }

  private buildProceduralFallback(): void {
    // Synthesize a stylized vector construct mask silhouette
    const w = 240;
    const h = 420;
    this.spriteWidth = w;
    this.spriteHeight = h;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;

    // Draw stylized spiked mane
    octx.fillStyle = '#ff2152';
    octx.beginPath();
    octx.moveTo(120, 40);
    octx.lineTo(190, 80);
    octx.lineTo(210, 160);
    octx.lineTo(170, 240);
    octx.lineTo(130, 270);
    octx.lineTo(110, 270);
    octx.lineTo(70, 240);
    octx.lineTo(30, 160);
    octx.lineTo(50, 80);
    octx.closePath();
    octx.fill();

    // Draw green mask face
    octx.fillStyle = '#36ff7a';
    octx.beginPath();
    octx.moveTo(90, 110);
    octx.lineTo(150, 110);
    octx.lineTo(145, 170);
    octx.lineTo(95, 170);
    octx.closePath();
    octx.fill();

    // Eyes
    octx.fillStyle = '#14101c';
    octx.fillRect(100, 125, 12, 10);
    octx.fillRect(128, 125, 12, 10);
    octx.fillStyle = '#3d6bff';
    octx.fillRect(103, 127, 6, 6);
    octx.fillRect(131, 127, 6, 6);

    // Torso & legs
    octx.fillStyle = '#14101c';
    octx.fillRect(105, 200, 30, 80);
    octx.fillStyle = '#36ff7a';
    octx.fillRect(98, 280, 16, 120);
    octx.fillRect(126, 280, 16, 120);

    const img = new Image();
    img.src = off.toDataURL();
    this.image = img;
    this.buildAlphaMap(off);
  }

  private buildAlphaMap(source: HTMLImageElement | HTMLCanvasElement): void {
    const c = document.createElement('canvas');
    c.width = this.spriteWidth;
    c.height = this.spriteHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0);
    const idata = ctx.getImageData(0, 0, this.spriteWidth, this.spriteHeight);
    this.alphaMap = idata.data;
  }

  public resizeCanvas(): void {
    const totalW = Math.round((this.spriteWidth + this.pad * 2) * this.scale);
    const totalH = Math.round((this.spriteHeight + this.pad * 2) * this.scale);
    this.canvas.width = totalW;
    this.canvas.height = totalH;
    this.canvas.style.width = `${totalW}px`;
    this.canvas.style.height = `${totalH}px`;
  }

  public update(now: number): void {
    if (now - this.lastDrawTime < this.fpsInterval) return;
    this.lastDrawTime = now;

    // Advance 4-drawing idle float
    this.currentFrameIndex = (this.currentFrameIndex + 1) % this.floatFrames.length;
    this.draw();
  }

  public draw(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.image) return;

    ctx.save();

    // Pivot around feet
    const bob = this.floatFrames[this.currentFrameIndex];
    const s = this.scale;
    const originX = (this.pad + this.spriteWidth * 0.5) * s;
    const originY = (this.pad + this.spriteHeight - 10) * s;

    ctx.translate(originX, originY + bob);
    ctx.scale(this.facing * s, s);
    ctx.translate(-this.spriteWidth * 0.5, -this.spriteHeight + 10);

    // Violet misregistration outline
    ctx.filter = 'drop-shadow(3px 3px 0 #7b3dff)';
    if (!this.isOnline) {
      // Offline: tinted red with slight opacity flicker
      ctx.globalAlpha = 0.85;
      ctx.filter = 'drop-shadow(4px 4px 0 #ff2152) hue-rotate(120deg)';
    }

    ctx.drawImage(this.image, 0, 0);
    ctx.restore();
  }

  /**
   * Pixel-precise alpha hit testing: converts screen clientX/clientY
   * into sprite texture coordinates and checks alpha > 40.
   */
  public hitTest(screenX: number, screenY: number): boolean {
    if (!this.alphaMap) return false;

    // Bounds of character in overlay
    const s = this.scale;
    const left = this.pos.x - (this.pad + this.spriteWidth * 0.5) * s;
    const top = this.pos.y - (this.pad + this.spriteHeight) * s;

    // Local coordinates inside canvas
    const lx = screenX - left;
    const ly = screenY - top;

    // Map into unscaled sprite space
    const spriteX = Math.round((lx / s) - this.pad);
    const spriteY = Math.round((ly / s) - this.pad);

    if (spriteX < 0 || spriteX >= this.spriteWidth || spriteY < 0 || spriteY >= this.spriteHeight) {
      return false;
    }

    const idx = (spriteY * this.spriteWidth + spriteX) * 4 + 3;
    const alpha = this.alphaMap[idx];
    return alpha > 40;
  }
}
