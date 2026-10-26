import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_BACKUPS = 3;

function getLogDir(): string {
  const dir = path.join(app.getPath('appData'), 'Capri', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLogPath(): string {
  return path.join(getLogDir(), 'capri.log');
}

function sanitize(message: string): string {
  return message
    .replace(/(sk-or-v1-[a-zA-Z0-9_-]{20,})/gi, '[REDACTED_API_KEY]')
    .replace(/(token["']?\s*[:=]\s*["']?)[a-zA-Z0-9_-]{24,}(["']?)/gi, '$1[REDACTED_TOKEN]$2')
    .replace(/(Bearer\s+)[a-zA-Z0-9_.-]+/gi, '$1[REDACTED_BEARER]');
}

function rotateIfNeeded(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < MAX_LOG_SIZE) return;

    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
      const oldPath = `${filePath}.${i}`;
      const newPath = `${filePath}.${i + 1}`;
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
      }
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch (err) {
    console.error('[logger] Rotation failed:', err);
  }
}

function writeLine(level: string, text: string): void {
  const clean = sanitize(text);
  const time = new Date().toISOString();
  const entry = `${time} [${level.toUpperCase()}] ${clean}\n`;

  // Standard console output
  if (level === 'error') {
    console.error(entry.trimEnd());
  } else {
    console.log(entry.trimEnd());
  }

  // File output with rotation
  try {
    const file = getLogPath();
    rotateIfNeeded(file);
    fs.appendFileSync(file, entry, 'utf-8');
  } catch (err) {
    console.error('[logger] File write failed:', err);
  }
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    const formatted = args.length ? `${msg} ${JSON.stringify(args)}` : msg;
    writeLine('info', formatted);
  },
  warn: (msg: string, ...args: unknown[]) => {
    const formatted = args.length ? `${msg} ${JSON.stringify(args)}` : msg;
    writeLine('warn', formatted);
  },
  error: (msg: string, ...args: unknown[]) => {
    const formatted = args.length ? `${msg} ${JSON.stringify(args)}` : msg;
    writeLine('error', formatted);
  },
  debug: (msg: string, ...args: unknown[]) => {
    const formatted = args.length ? `${msg} ${JSON.stringify(args)}` : msg;
    writeLine('debug', formatted);
  },
};
