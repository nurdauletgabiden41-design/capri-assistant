import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface CapriConfig {
  version: number;
  visible: boolean;
  scale: number;
  muted: boolean;
  volume: number;
  lang: string;
  motion: 'auto' | 'full' | 'reduced';
  wander: boolean;
  possess: boolean;
  rest: 'corner' | 'taskbar';
  displayId?: number;
  model: string;
  dailyBudgetUsd: number;
  voiceEnabled: boolean;
  floorGap?: number;
}

const DEFAULT_CONFIG: CapriConfig = {
  version: 1,
  visible: true,
  scale: 0.6,
  muted: false,
  volume: 0.7,
  lang: 'ru',
  motion: 'auto',
  wander: true,
  possess: false,
  rest: 'corner',
  model: 'anthropic/claude-haiku-5.5',
  dailyBudgetUsd: 0.50,
  voiceEnabled: true,
  floorGap: 0,
};

export function getConfigDir(): string {
  const dir = path.join(app.getPath('appData'), 'Capri');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCustomSoundsDir(): string {
  const dir = path.join(getConfigDir(), 'custom_sounds');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): CapriConfig {
  const filePath = getConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return migrateConfig(parsed);
    }
  } catch (err) {
    console.error('[config] Failed to load config, using defaults:', err);
  }
  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(patch: Partial<CapriConfig>): CapriConfig {
  const current = fs.existsSync(getConfigPath()) ? loadConfig() : DEFAULT_CONFIG;
  const updated: CapriConfig = { ...current, ...patch, version: 1 };
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('[config] Failed to write config:', err);
  }
  return updated;
}

function migrateConfig(loaded: Record<string, unknown>): CapriConfig {
  const version = typeof loaded.version === 'number' ? loaded.version : 0;
  let cfg = { ...DEFAULT_CONFIG, ...loaded };

  if (version < 1) {
    // Migration logic for future version updates
    cfg.version = 1;
  }
  return cfg as CapriConfig;
}
