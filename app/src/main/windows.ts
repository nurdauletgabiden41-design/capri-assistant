// Adapted from mochiiwuff/capri-desktop (MIT)
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { BrowserWindow, screen } from 'electron';
import { logger } from './logger';

export interface WindowRect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  max: boolean;
}

export interface WindowSnapshot {
  fg: number;
  wins: WindowRect[];
}

export interface WindowWatchHandle {
  stop: () => void;
}

export function startWindowWatch(
  overlay: BrowserWindow,
  onUpdate: (snapshot: WindowSnapshot) => void
): WindowWatchHandle {
  if (process.platform !== 'win32') {
    return { stop: () => {} };
  }

  let child: ChildProcess | null = null;
  let stopped = false;
  let restarts = 0;

  let scriptPath = path.join(__dirname, 'windows.ps1');
  if (scriptPath.includes('app.asar')) {
    scriptPath = scriptPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  }

  let selfHwnd = 0n;
  try {
    const handle = overlay.getNativeWindowHandle();
    selfHwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
  } catch (err) {
    logger.warn('[windows] Could not read native window handle:', err);
  }

  const toOverlay = (win: any, bounds: Electron.Rectangle): WindowRect => {
    const dip = screen.screenToDipRect(null, {
      x: win.x,
      y: win.y,
      width: win.w,
      height: win.h,
    });
    return {
      id: win.id,
      x: dip.x - bounds.x,
      y: dip.y - bounds.y,
      w: dip.width,
      h: dip.height,
      max: Boolean(win.max),
    };
  };

  const start = () => {
    if (stopped) return;
    logger.info(`[windows] Spawning window watcher PowerShell helper with HWND=${selfHwnd}...`);

    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          String(selfHwnd),
          String(process.pid),
        ],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      if (child.stdout) {
        const rl = readline.createInterface({ input: child.stdout });
        rl.on('line', (line: string) => {
          let snap: any;
          try {
            snap = JSON.parse(line);
          } catch {
            return;
          }
          if (overlay.isDestroyed()) return;

          const bounds = overlay.getBounds();
          const wins: WindowRect[] = (snap.wins || [])
            .map((w: any) => toOverlay(w, bounds))
            .filter((w: WindowRect) => (
              w.x < bounds.width &&
              w.x + w.w > 0 &&
              w.y < bounds.height &&
              w.y + w.h > 0
            ));

          logger.info(`[windows] Snapshot: ${wins.length} active window(s), fg=${snap.fg || 0}`);
          onUpdate({
            fg: snap.fg || 0,
            wins,
          });
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (d: Buffer) => {
          logger.warn(`[windows] Helper stderr: ${String(d).trim()}`);
        });
      }

      child.on('exit', (code, signal) => {
        logger.info(`[windows] Helper exited (code=${code}, signal=${signal})`);
        child = null;
        if (!stopped && restarts < 3) {
          restarts++;
          const delay = restarts * 3000;
          logger.info(`[windows] Restarting window watcher in ${delay}ms (attempt ${restarts}/3)...`);
          setTimeout(start, delay);
        }
      });
    } catch (err) {
      logger.error('[windows] Failed to spawn window watcher helper:', err);
    }
  };

  start();

  return {
    stop: () => {
      stopped = true;
      if (child) {
        try {
          child.kill();
        } catch {}
        child = null;
      }
    },
  };
}
