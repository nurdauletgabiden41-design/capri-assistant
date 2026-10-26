import path from 'node:path';
import { BrowserWindow, Display, screen } from 'electron';
import { loadConfig } from './config';
import { logger } from './logger';

export class OverlayManager {
  public window: BrowserWindow | null = null;
  private isNearTarget = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentDisplayId: number | null = null;

  constructor() {
    this.currentDisplayId = loadConfig().displayId ?? null;
  }

  public get targetDisplay(): Display {
    const displays = screen.getAllDisplays();
    if (this.currentDisplayId) {
      const match = displays.find((d) => d.id === this.currentDisplayId);
      if (match) return match;
    }
    return screen.getPrimaryDisplay();
  }

  public get overlayArea(): { area: Electron.Rectangle; gap: number } {
    const display = this.targetDisplay;
    const { workArea, bounds } = display;
    const cfg = loadConfig();

    if (cfg.rest === 'taskbar') {
      const area = { ...bounds, y: bounds.y + 1, height: bounds.height - 1 };
      const gap = area.y + area.height - (workArea.y + workArea.height);
      return { area, gap };
    }
    return { area: workArea, gap: 0 };
  }

  public create(): BrowserWindow {
    const { area, gap } = this.overlayArea;
    const preloadPath = path.resolve(__dirname, '..', 'preload', 'index.js');
    const rendererPath = path.resolve(__dirname, '..', 'renderer', 'index.html');

    logger.info(`[overlay] Creating overlay at ${area.x},${area.y} (${area.width}x${area.height}), gap: ${gap}`);

    const win = new BrowserWindow({
      ...area,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      type: process.platform === 'win32' ? 'toolbar' : undefined,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // needed for preload to bundle nicely with standard IPC
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: true });

    win.loadFile(rendererPath);

    win.once('ready-to-show', () => {
      this.fitOverlay();
      win.showInactive();
      this.startCursorPolling();
    });

    win.webContents.on('render-process-gone', (_e, details) => {
      logger.error(`[overlay] Renderer gone: ${details.reason}`);
    });

    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      logger.info(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });

    this.window = win;
    return win;
  }

  public fitOverlay(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const { area, gap } = this.overlayArea;
    this.window.setBounds(area);
    this.window.webContents.send('overlay:resize', {
      width: area.width,
      height: area.height,
      gap,
    });
  }

  public rearm(): void {
    if (!this.window || this.window.isDestroyed()) return;
    logger.info('[overlay] Rearming mouse hook and always-on-top level...');
    this.window.setIgnoreMouseEvents(false);
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.fitOverlay();
    this.window.webContents.send('overlay:rearmed');
  }

  public setInteractive(interactive: boolean): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  public setFocusable(focusable: boolean): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setFocusable(focusable);
    if (focusable) {
      this.window.focus();
    } else {
      this.window.blur();
    }
  }

  public setNearTarget(near: boolean): void {
    if (this.isNearTarget !== near) {
      this.isNearTarget = near;
      this.startCursorPolling(); // Reschedule polling interval
    }
  }

  public getCursorRelative(): { x: number; y: number; inside: boolean } {
    if (!this.window || this.window.isDestroyed()) {
      return { x: 0, y: 0, inside: false };
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = this.window.getBounds();
    return {
      x: cursor.x - bounds.x,
      y: cursor.y - bounds.y,
      inside:
        cursor.x >= bounds.x &&
        cursor.y >= bounds.y &&
        cursor.x < bounds.x + bounds.width &&
        cursor.y < bounds.y + bounds.height,
    };
  }

  private startCursorPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    // ≈30 Hz (33 ms) when near character/panel, slower (200 ms) when far away
    const interval = this.isNearTarget ? 33 : 200;

    this.pollTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) return;
      const pos = this.getCursorRelative();
      this.window.webContents.send('overlay:cursor-poll', pos);
    }, interval);
  }

  public setDisplay(displayId: number): void {
    this.currentDisplayId = displayId;
    this.fitOverlay();
  }

  public destroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
    }
  }
}
