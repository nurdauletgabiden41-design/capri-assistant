import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';

export type HolocallEmotion = 'calm' | 'laugh' | 'wink';

export class HolocallFeed {
  public canvas: HTMLCanvasElement;
  private app: Application | null = null;
  private container: Container | null = null;
  private sprite: Sprite | null = null;

  private textures: Record<HolocallEmotion, Texture | null> = {
    calm: null,
    laugh: null,
    wink: null,
  };

  private currentEmotion: HolocallEmotion = 'calm';
  private voiceLevel = 0;
  private targetVoiceLevel = 0;
  private isSpeaking = false;
  private glitchUntil = 0;
  private glitchStrength = 0;
  private baseScale = 0.38;
  private animTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public async init(): Promise<void> {
    try {
      const app = new Application();
      await app.init({
        canvas: this.canvas,
        width: 440,
        height: 330,
        backgroundAlpha: 0,
        resolution: Math.max(1, window.devicePixelRatio || 1),
        autoDensity: true,
        antialias: true,
      });
      this.app = app;

      // Load 3 Full HD emotion busts
      const [calmTex, laughTex, winkTex] = await Promise.all([
        Assets.load('../assets/capri/capri-calm-bust-hd.png').catch(() => null),
        Assets.load('../assets/capri/capri-laugh-hd.png').catch(() => null),
        Assets.load('../assets/capri/capri-wink-hd.png').catch(() => null),
      ]);

      this.textures.calm = calmTex;
      this.textures.laugh = laughTex;
      this.textures.wink = winkTex;

      const cont = new Container();
      app.stage.addChild(cont);
      this.container = cont;

      const initialTex = this.textures.calm || Texture.EMPTY;
      const spr = new Sprite(initialTex);
      spr.anchor.set(0.5, 0.5);
      spr.position.set(220, 175);

      // Fit to screen height (approx 310px height on screen)
      if (initialTex && initialTex.height > 0) {
        this.baseScale = 310 / initialTex.height;
      }
      spr.scale.set(this.baseScale);

      cont.addChild(spr);
      this.sprite = spr;

      // Start Pixi ticker loop
      app.ticker.add((ticker) => {
        this.update(ticker.lastTime);
      });

      console.log('[HolocallFeed] PixiJS Holographic Feed initialized successfully.');
    } catch (err) {
      console.error('[HolocallFeed] Failed to initialize PixiJS feed:', err);
      this.initFallback2D();
    }
  }

  private initFallback2D(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.src = '../assets/capri/capri-calm-bust-hd.png';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    };
  }

  public setEmotion(emotion: HolocallEmotion): void {
    if (this.currentEmotion === emotion && !this.isGlitching) return;
    this.currentEmotion = emotion;

    if (this.sprite && this.textures[emotion]) {
      this.sprite.texture = this.textures[emotion]!;
      this.triggerGlitch(0.7, 180);
    }
  }

  public setVoiceLevel(level: number): void {
    this.targetVoiceLevel = Math.max(0, Math.min(1, level));
  }

  public setSpeaking(speaking: boolean): void {
    this.isSpeaking = speaking;
    if (!speaking) {
      this.targetVoiceLevel = 0;
    }
  }

  public get speaking(): boolean {
    return this.isSpeaking;
  }

  public triggerGlitch(strength: number = 0.6, durationMs: number = 220): void {
    this.glitchStrength = strength;
    this.glitchUntil = performance.now() + durationMs;
  }

  public get isGlitching(): boolean {
    return performance.now() < this.glitchUntil;
  }

  public update(time: number): void {
    if (!this.sprite || !this.container) return;

    this.animTime = time / 1000;

    // Smooth voice level easing
    this.voiceLevel += (this.targetVoiceLevel - this.voiceLevel) * 0.25;

    // Idle holographic breathing sway
    const breathing = Math.sin(this.animTime * 2.2) * 2.5;
    const breathingScale = Math.sin(this.animTime * 1.8) * 0.008;

    // Viseme audio pulse
    const speechPulse = this.voiceLevel * 0.05;
    const currentScale = this.baseScale + breathingScale + speechPulse;

    let posX = 220;
    let posY = 175 + breathing;

    // Holographic horizontal jitter & glitch displacement
    if (this.isGlitching) {
      const g = this.glitchStrength;
      posX += (Math.random() - 0.5) * 24 * g;
      posY += (Math.random() - 0.5) * 12 * g;
      this.sprite.alpha = 0.75 + Math.random() * 0.25;
      this.sprite.tint = Math.random() < 0.5 ? 0x00f0ff : 0xff2152;
    } else {
      this.sprite.alpha = 0.96 + Math.sin(this.animTime * 15) * 0.04;
      this.sprite.tint = 0xffffff;
    }

    this.sprite.position.set(posX, posY);
    this.sprite.scale.set(currentScale);
  }

  public resize(width: number, height: number): void {
    if (this.app) {
      this.app.renderer.resize(width, height);
      if (this.sprite) {
        this.sprite.position.set(width / 2, height / 2 + 10);
      }
    }
  }

  public destroy(): void {
    try {
      this.app?.destroy(true, { children: true, texture: false });
      this.app = null;
    } catch (_) {}
  }
}
