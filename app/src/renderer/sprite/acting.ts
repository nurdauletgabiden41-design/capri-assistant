// Adapted from mochiiwuff/capri-desktop (MIT)

/**
 * Pose-to-pose acting, timed the way cel animation is: an act is an exposure sheet,
 * a list of drawings, each held for a number of frames. Nothing is tweened.
 */

export const SHEET_FPS = 12;

export interface Pose {
  head?: number;
  mane?: number;
  hair?: number;
  tilt?: number;
  bob?: number;
  sx?: number;
  sy?: number;
  armL?: number;
  armR?: number;
  arms?: number;
  reach?: number;
  long?: number;
  longL?: number;
  longR?: number;
  smear?: [number, number];
  echo?: [number, number];
  kickL?: number;
  kickR?: number;
}

export type ActKey = [number, Pose, string?];

export interface ActDefinition {
  loop?: boolean;
  directional?: boolean;
  priority?: number;
  fps?: number;
  flip?: boolean;
  keys: ActKey[];
}

const rep = (n: number, keys: ActKey[]): ActKey[] => Array.from({ length: n }, () => keys).flat();

export const NEUTRAL: Required<Pose> = {
  head: 0,
  mane: 0,
  hair: 0,
  tilt: 0,
  bob: 0,
  sx: 1,
  sy: 1,
  armL: 0,
  armR: 0,
  arms: 0,
  reach: 0,
  long: 1,
  longL: 1,
  longR: 1,
  smear: [0, 0],
  echo: [0, 0],
  kickL: 0,
  kickR: 0,
};

export const ACTS: Record<string, ActDefinition> = {
  // ---- Stances (looping) ----

  // Floating: four drawings; arms lag behind body
  stand: {
    loop: true,
    keys: [
      [6, { bob: 0, hair: -2.5, arms: 0.04 }],
      [4, { bob: -2, hair: 0, arms: 0 }],
      [6, { bob: -4, hair: 2.5, arms: -0.05 }],
      [4, { bob: -2, hair: 0, arms: 0 }],
    ],
  },

  // Perched on a window, hands down on ledge, legs kicking
  sit: {
    loop: true,
    keys: [
      [5, { kickL: 0.24, kickR: -0.03, hair: -1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: -0.03, kickR: 0.24, hair: 1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: 0.24, kickR: -0.03, hair: -1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: -0.03, kickR: 0.24, hair: 1.5, arms: -0.42 }],
      [10, { kickL: 0.04, kickR: 0.04, head: 0.08, arms: -0.4 }],
    ],
  },

  // Leaning in from the edge of the screen
  peek: {
    loop: true,
    directional: true,
    keys: [
      [18, { tilt: 7, head: 0.14, reach: 0.1 }],
      [1, { tilt: 7, head: 0.2, smear: [-6, 0], reach: 0.16 }],
      [14, { tilt: 7.5, head: 0.24, mane: 0.08, reach: 0.18 }],
      [1, { tilt: 6, head: 0.14, reach: 0.12 }],
      [12, { tilt: 6.5, head: 0.12, bob: -2, reach: 0.1 }],
    ],
  },

  // Asleep: arms hanging, head dropped; jolt awake now and then
  sleep: {
    loop: true,
    keys: [
      [18, { head: 0.1, mane: -0.12, bob: 2, arms: -0.3 }],
      [1, { head: 0.16, mane: -0.13, bob: 4, arms: -0.34 }],
      [10, { head: 0.21, mane: -0.15, bob: 5, arms: -0.36 }],
      [1, { head: 0.06, mane: -0.08, bob: 0, smear: [0, 8], arms: -0.18 }], // jolt
      [4, { head: 0.08, mane: -0.1, bob: 1, arms: -0.26 }],
    ],
  },

  // ---- One-shot acts ----

  // Little nods while speaking, on threes
  talk: {
    priority: 0,
    keys: rep(2, [
      [3, { head: 0.04, mane: 0.08 }],
      [3, { head: 0, mane: 0.03 }],
    ]),
  },

  // The cocked head
  curious: {
    priority: 1,
    directional: true,
    keys: [
      [1, { head: -0.05, mane: 0.04 }],
      [1, { head: 0.12, mane: 0.15, tilt: 1, smear: [-12, 4] }],
      [10, { head: 0.19, mane: 0.14, tilt: 2 }],
      [6, { head: 0.16, mane: 0.1, tilt: 1.6 }],
      [1, { head: 0.07, tilt: 0.6 }],
    ],
  },

  // Head snap left and right
  look: {
    priority: 1,
    keys: [
      [1, { head: 0.08, smear: [-8, 0] }],
      [8, { head: 0.16 }],
      [1, { head: 0 }],
      [1, { head: -0.08, smear: [8, 0] }],
      [8, { head: -0.16 }],
      [1, { head: -0.05 }],
      [3, { head: 0 }],
    ],
  },

  // Satellite gaze
  gaze: {
    priority: 1,
    directional: true,
    keys: [
      [3, {}, 'glint'],
      [1, { head: -0.05, bob: 1 }],
      [1, { head: 0.14, mane: 0.12, smear: [-8, 6] }, 'notice'],
      [6, { head: 0.2, mane: 0.1, hair: 0, bob: 0 }],
      [6, { head: 0.23, mane: 0.14, hair: 0, bob: 0 }, 'starlight'],
      [3, { head: 0.23, mane: 0.15, hair: 0, bob: 0, reach: 0.25, long: 1.1 }],
      [3, { head: 0.24, mane: 0.16, hair: 0, bob: 0, reach: 0.55, long: 1.2 }],
      [2, { head: 0.24, mane: 0.16, hair: 0, bob: -1, reach: 0.8, long: 1.3 }],
      [2, { head: 0.25, mane: 0.17, hair: 0, bob: -2, reach: 0.93, long: 1.35 }],
      [14, { head: 0.25, mane: 0.17, hair: 0, bob: -3, reach: 1, long: 1.38 }],
      [1, { head: 0.27, mane: 0.22, hair: 0, bob: -4, reach: 1.02, long: 1.42 }, 'glimmer'],
      [8, { head: 0.25, mane: 0.18, hair: 0, bob: -3, reach: 1, long: 1.38 }],
      [2, { head: 0.14, mane: 0.1, bob: -2, reach: 0.45, long: 1.15 }],
      [2, { head: 0.08, mane: 0.04, bob: -1, reach: 0.12, long: 1.03 }],
      [8, { head: 0.06, mane: -0.04, reach: -0.06 }],
      [1, {}],
    ],
  },

  // Job done / victory sequence (24 fps on ones)
  victory: {
    priority: 4,
    fps: 24,
    directional: true,
    keys: [
      [3, { sy: 0.9, sx: 1.05, bob: 6, arms: -0.3, mane: -0.15 }],
      [3, { sy: 0.82, sx: 1.1, bob: 10, arms: -0.5, mane: -0.3, head: -0.04 }, 'gather'],
      [1, { sy: 1.24, sx: 0.85, bob: -16, arms: 0.55, mane: 0.45, smear: [0, 22], echo: [12, 0] }, 'launch'],
      [2, { sy: 1.1, sx: 0.94, bob: -30, arms: 1.45, mane: 0.85, echo: [20, -4] }, 'peak'],
      [10, { bob: -36, arms: 1.32, mane: 0.78, head: 0.05 }],
      [2, { bob: -34, arms: 1.18, mane: 0.7, head: -0.08 }, 'laugh'],
      [2, { bob: -38, arms: 1.36, mane: 0.8, head: 0.08 }],
      ...rep(4, [
        [2, { bob: -34, arms: 1.18, mane: 0.7, head: -0.08 }],
        [2, { bob: -38, arms: 1.36, mane: 0.8, head: 0.08 }],
      ]),
      [2, { bob: -24, arms: 0.7, mane: 0.45, sy: 1.04 }, 'speak'],
      [2, { bob: -8, arms: 0.15, mane: 0.2, sy: 1.06, sx: 0.96, smear: [0, -12] }],
      [2, { bob: 3, arms: -0.15, mane: -0.06, sy: 0.88, sx: 1.08 }],
      [3, { bob: 1, arms: 0.05, sy: 0.97, sx: 1.02 }],
      [2, { arms: 0 }],
    ],
  },

  // Red lightning zap at pointer
  zap: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [3, { reach: 0.2, long: 0.9, head: -0.06, mane: 0.1, bob: 1 }],
      [1, { reach: 1, long: 1.6, head: 0.12, mane: 0.32, smear: [-10, 0], echo: [6, 0] }, 'zap'],
      [6, { reach: 1, long: 1.52, head: 0.14, mane: 0.26 }],
      [4, { reach: 0.96, long: 1.42, head: 0.18, mane: 0.2 }, 'grin'],
      [10, { reach: 0.9, long: 1.36, head: 0.2, mane: 0.16 }],
      [3, { reach: 0.5, long: 1.15, head: 0.14, mane: 0.08 }],
      [3, { reach: 0.15, head: 0.06 }],
      [1, {}],
    ],
  },

  // Bristling alarm / attention needed
  alarm: {
    priority: 2,
    directional: true,
    keys: [
      [1, { mane: 0.34, head: 0.1, tilt: 3, arms: 0.36 }, 'stare'],
      [1, { mane: 0.12, head: 0.1, tilt: 3, arms: 0.24 }],
      ...rep(14, [
        [1, { mane: 0.34, head: 0.1, tilt: 3, arms: 0.36 }],
        [1, { mane: 0.12, head: 0.1, tilt: 3, arms: 0.24 }],
      ]),
    ],
  },

  // Flinch from command failure
  flinch: {
    priority: 2,
    keys: [
      [2, { head: 0.22, tilt: 4, sx: 0.92, sy: 1.06, mane: -0.12, bob: 5, smear: [-10, 0], arms: -0.32 }],
      [5, { head: 0.18, tilt: 3.4, mane: -0.1, bob: 4, arms: -0.22 }],
      [1, { head: 0.09, tilt: 1.5, bob: 2, arms: -0.08 }],
    ],
  },

  // Turnaround: flat cut-out squashes to a sliver and mirrors
  turn: {
    priority: 3,
    fps: 24,
    flip: true,
    keys: [
      [1, { sx: 0.7, sy: 1.02, echo: [6, 0], arms: -0.1 }],
      [1, { sx: 0.25, sy: 1.04, echo: [10, 0], mane: 0.2, arms: -0.2 }],
      [1, { sx: -0.25, sy: 1.04, echo: [10, 0], mane: 0.2, arms: -0.2 }],
      [1, { sx: -0.7, sy: 1.02, arms: -0.1 }],
      [2, { sx: -1, arms: 0.04 }],
    ],
  },

  // Hop in place
  hop: {
    priority: 3,
    fps: 24,
    keys: [
      [3, { sy: 0.86, sx: 1.08, bob: 6, mane: -0.08, arms: -0.3 }],
      [1, { sy: 1.18, sx: 0.9, bob: -10, smear: [0, 16], arms: 0.4 }],
      [2, { sy: 1.08, sx: 0.95, bob: -32, mane: 0.15, arms: 0.55 }],
      [4, { bob: -42, mane: 0.3, arms: 0.6 }],
      [2, { sy: 1.06, bob: -26, mane: 0.2, arms: 0.35 }],
      [1, { sy: 1.12, sx: 0.92, bob: -8, smear: [0, -14], arms: 0.15 }],
      [2, { sy: 0.82, sx: 1.12, bob: 5, mane: -0.1, arms: -0.28 }],
      [2, { sy: 0.94, sx: 1.04, bob: 2, arms: 0.06 }],
      [1, {}],
    ],
  },

  // Falling down
  fall: {
    loop: true,
    fps: 24,
    keys: [
      [2, { sy: 1.12, sx: 0.92, mane: 0.36, head: 0.05, smear: [0, -16], armL: 0.8, armR: 0.55 }],
      [2, { sy: 1.1, sx: 0.93, mane: 0.26, head: -0.04, smear: [0, -12], armL: 0.55, armR: 0.82 }],
    ],
  },

  // Landing after a fall
  land: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.72, sx: 1.22, bob: 6, mane: -0.22, arms: -0.4 }],
      [2, { sy: 0.88, sx: 1.08, bob: 3, mane: -0.1, arms: -0.15 }],
      [2, { sy: 1.05, sx: 0.97, mane: 0.1, arms: 0.1 }],
      [1, {}],
    ],
  },
};

export class Player {
  public name: string;
  public act: ActDefinition;
  public dir: number;
  public reach: number | (() => number);
  public start: number;
  public total: number;

  constructor(
    name: string,
    {
      dir = 0,
      reach = 1,
      at = performance.now(),
    }: { dir?: number; reach?: number | (() => number); at?: number } = {}
  ) {
    this.name = name;
    this.act = ACTS[name] || ACTS.stand;
    this.dir = dir;
    this.reach = reach;
    this.start = at;
    this.total = this.act.keys.reduce((n, [hold]) => n + hold, 0);
  }

  public get priority(): number {
    return this.act.priority ?? 0;
  }

  public sample(now: number): { pose: Pose; index: number; cue?: string } | null {
    const fps = this.act.fps || SHEET_FPS;
    let f = Math.floor((now - this.start) / (1000 / fps));
    if (f >= this.total) {
      if (!this.act.loop) return null;
      f %= this.total;
    }
    const { keys } = this.act;
    for (let i = 0; i < keys.length; i++) {
      const [hold, pose, cue] = keys[i];
      if (f < hold) return { pose, index: i, cue };
      f -= hold;
    }
    return null;
  }

  public resolve(pose: Pose, facing: number): Pose {
    const out: Pose = { ...pose };
    const lean = this.act.directional && this.dir ? this.dir * facing : 0;
    if (lean) {
      if (pose.head !== undefined) out.head = pose.head * lean;
      if (pose.tilt !== undefined) out.tilt = pose.tilt * this.dir;
      if (pose.smear) out.smear = [pose.smear[0] * lean, pose.smear[1]];
      if (pose.echo) out.echo = [pose.echo[0] * lean, pose.echo[1]];
    }
    if (pose.arms !== undefined) {
      out.armL = pose.arms;
      out.armR = pose.arms;
    }
    if (pose.reach !== undefined) {
      const scale = typeof this.reach === 'function' ? this.reach() : this.reach;
      out[lean < 0 ? 'armL' : 'armR'] = pose.reach * scale;
    }
    if (pose.long !== undefined) {
      out[lean < 0 ? 'longL' : 'longR'] = pose.long;
    }
    delete out.arms;
    delete out.reach;
    delete out.long;
    return out;
  }
}
