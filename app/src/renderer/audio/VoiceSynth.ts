// Adapted from mochiiwuff/capri-desktop (MIT)

export type SoundCue =
  | 'teleport-out'
  | 'teleport-in'
  | 'done'
  | 'alert'
  | 'error'
  | 'hello'
  | 'blip'
  | 'tick'
  | 'star'
  | 'land'
  | 'rise'
  | 'bolt'
  | 'charge'
  | 'possess';

const BLIP_NOTES = [62, 65, 67, 69, 72, 74, 77, 79];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class VoiceSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  public muted = false;
  public volume = 0.7;
  private customSounds = new Map<string, AudioBuffer>();
  private lastBlipTime = 0;

  constructor() {}

  public ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

    // Soft clipper curve to prevent harsh distortion when sounds stack
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    shaper.curve = curve;
    this.master.connect(shaper).connect(ctx.destination);
    this.noise = this.makeNoise(ctx);
    return ctx;
  }

  public configure(opts: { muted?: boolean; volume?: number }): void {
    if (typeof opts.muted === 'boolean') this.muted = opts.muted;
    if (typeof opts.volume === 'number') {
      this.volume = Math.max(0, Math.min(1, opts.volume));
      if (this.master) this.master.gain.value = this.volume;
    }
  }

  public async loadCustomSound(cue: string, audioData: ArrayBuffer): Promise<void> {
    const ctx = this.ensure();
    try {
      const decoded = await ctx.decodeAudioData(audioData);
      this.customSounds.set(cue, decoded);
    } catch (err) {
      console.warn(`[voice] Failed to decode custom sound for ${cue}:`, err);
    }
  }

  public play(cue: SoundCue, opts: { mood?: string; soft?: boolean } = {}): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const custom = this.customSounds.get(cue);
    if (custom) {
      const src = ctx.createBufferSource();
      src.buffer = custom;
      src.connect(this.master!);
      src.start();
      return;
    }

    switch (cue) {
      case 'teleport-out':
        this.synthZap(false);
        break;
      case 'teleport-in':
        this.synthZap(true);
        break;
      case 'done':
        this.synthDone();
        break;
      case 'alert':
        this.synthAlert();
        break;
      case 'error':
        this.synthError();
        break;
      case 'hello':
        this.synthHello();
        break;
      case 'blip':
        this.synthBlip(opts.mood);
        break;
      case 'tick':
        this.synthTick();
        break;
      case 'star':
        this.synthStar();
        break;
      case 'land':
        this.synthLand();
        break;
      case 'rise':
        this.synthRise();
        break;
      case 'bolt':
        this.synthBolt(opts.soft);
        break;
      case 'charge':
        this.synthCharge();
        break;
      case 'possess':
        this.synthPossess();
        break;
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private env(gain: GainNode, t: number, a: number, peak: number, d: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private osc(
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    peak: number,
    dest: AudioNode = this.master!
  ): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.env(g, t, 0.004, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noiseBurst(
    t: number,
    dur: number,
    peak: number,
    from: number,
    to: number,
    q = 2
  ): void {
    if (!this.noise) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Teleport saw sweep + noise
  private synthZap(arriving: boolean): void {
    const t = this.ctx!.currentTime;
    const o = this.osc('sawtooth', arriving ? 1600 : 180, t, 0.22, 0.12);
    o.frequency.exponentialRampToValueAtTime(arriving ? 140 : 2400, t + 0.2);
    this.noiseBurst(t, 0.2, 0.22, arriving ? 6000 : 400, arriving ? 500 : 7000, 3);
    for (let i = 0; i < 4; i++) {
      this.osc('square', 800 + Math.random() * 2400, t + 0.02 + i * 0.035, 0.02, 0.05);
    }
    if (arriving) this.osc('triangle', 70, t + 0.16, 0.18, 0.3);
  }

  private synthBlip(mood = 'talk'): void {
    const now = performance.now();
    if (now - this.lastBlipTime < 45) return;
    this.lastBlipTime = now;

    const t = this.ctx!.currentTime;
    const base =
      BLIP_NOTES[Math.floor(Math.random() * BLIP_NOTES.length)] +
      (mood === 'alert' ? 5 : mood === 'error' ? -7 : 0);
    const f = midi(base);
    this.osc('square', f, t, 0.035, 0.035);
    this.osc('triangle', f * 1.498, t + 0.004, 0.03, 0.025);
    this.osc('square', f * 0.501, t + 0.008, 0.03, 0.018);
  }

  private synthTick(): void {
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.03, 0.06, 3000, 9000, 8);
  }

  private synthBolt(soft = false): void {
    const t = this.ctx!.currentTime;
    const k = soft ? 0.35 : 1;
    const o = this.osc('sawtooth', 62, t, 0.3 * k + 0.05, 0.08 * k);
    o.frequency.setValueAtTime(58, t + 0.05);
    for (let i = 0; i < (soft ? 3 : 8); i++) {
      this.noiseBurst(
        t + i * (0.02 + Math.random() * 0.025),
        0.025,
        0.14 * k,
        2500 + Math.random() * 3500,
        4000 + Math.random() * 5000,
        6
      );
    }
  }

  private synthCharge(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.7);
    for (let i = 0; i < 6; i++) {
      this.noiseBurst(t + 0.08 + i * 0.09, 0.02, 0.04 + i * 0.016, 3000, 7000, 6);
    }
  }

  private synthPossess(): void {
    const t = this.ctx!.currentTime;
    [79, 76, 72].forEach((n, i) => {
      const at = t + i * 0.11;
      this.osc('square', midi(n), at, 0.07, 0.05);
      this.osc('square', midi(n) * 1.012, at + 0.004, 0.06, 0.035);
      this.osc('triangle', midi(n - 12), at + 0.008, 0.07, 0.04);
    });
    this.noiseBurst(t, 0.3, 0.05, 1200, 5000, 3);
  }

  private synthRise(): void {
    const t = this.ctx!.currentTime;
    const o = this.osc('sawtooth', 160, t, 0.2, 0.07);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    this.noiseBurst(t, 0.18, 0.12, 500, 6000, 2);
  }

  private synthLand(): void {
    const t = this.ctx!.currentTime;
    const o = this.osc('triangle', 150, t, 0.14, 0.22);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    this.noiseBurst(t, 0.06, 0.08, 1800, 400, 1.5);
  }

  private synthStar(): void {
    const t = this.ctx!.currentTime;
    this.osc('sine', midi(93), t, 0.9, 0.05);
    this.osc('sine', midi(100), t + 0.14, 1.2, 0.035);
    this.noiseBurst(t + 0.05, 0.6, 0.015, 9000, 12000, 6);
  }

  private synthHello(): void {
    const t = this.ctx!.currentTime;
    [69, 76, 81].forEach((n, i) =>
      this.osc('square', midi(n), t + i * 0.06, 0.07, 0.06)
    );
    this.noiseBurst(t + 0.18, 0.08, 0.06, 2000, 8000, 5);
  }

  private synthDone(): void {
    const t = this.ctx!.currentTime;
    [64, 68, 71, 75, 76].forEach((n, i) => {
      this.osc('triangle', midi(n + 12), t + i * 0.07, 0.28, 0.09);
      this.osc('square', midi(n), t + i * 0.07, 0.12, 0.035);
    });
    for (let i = 0; i < 7; i++) {
      this.osc(
        'square',
        1200 + Math.random() * 3000,
        t + 0.4 + i * 0.03,
        0.018,
        0.035
      );
    }
  }

  private synthAlert(): void {
    const t = this.ctx!.currentTime;
    for (let r = 0; r < 2; r++) {
      this.osc('square', 988, t + r * 0.28, 0.09, 0.07);
      this.osc('square', 740, t + r * 0.28 + 0.11, 0.11, 0.07);
    }
  }

  private synthError(): void {
    const t = this.ctx!.currentTime;
    const o = this.osc('sawtooth', 110, t, 0.32, 0.14);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
    this.noiseBurst(t, 0.25, 0.15, 900, 200, 1.2);
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(t + 0.05 + i * 0.05, 0.02, 0.12, 4000, 4000, 10);
    }
  }
}
