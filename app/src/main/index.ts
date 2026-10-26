import fs from 'node:fs';
import path from 'node:path';
import { app, globalShortcut, ipcMain, powerMonitor, screen } from 'electron';
import { BrainProcessManager } from './brain-process';
import { CapriConfig, loadConfig, saveConfig } from './config';
import { logger } from './logger';
import { OverlayManager } from './overlay';
import { TrayManager } from './tray';
import { startWindowWatch, type WindowWatchHandle } from './windows';
import { CapriWsServer } from './ws-server';

let overlay: OverlayManager | null = null;
let tray: TrayManager | null = null;
let wsServer: CapriWsServer | null = null;
let brain: BrainProcessManager | null = null;
let windowWatch: WindowWatchHandle | null = null;

const projectRoot = path.resolve(__dirname, '..', '..');

app.name = 'Capri';
app.setPath('userData', path.join(app.getPath('appData'), 'Capri'));

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.info('[main] Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    logger.info('[main] Second instance detected. Showing overlay.');
    if (overlay && overlay.window) {
      overlay.window.show();
      overlay.rearm();
    }
  });

  app.whenReady().then(async () => {
    logger.info('[main] Capri Electron Host starting up...');

    // 1. Initialize local WebSocket server
    wsServer = await CapriWsServer.create();

    // 2. Spawn Python brain child process
    brain = new BrainProcessManager(wsServer.port, wsServer.token, projectRoot);
    brain.start();

    // 3. Create transparent overlay
    overlay = new OverlayManager();
    const win = overlay.create();

    // 4. Initialize Tray
    tray = new TrayManager({
      onToggleVisible: () => toggleVisible(),
      onPlayDemo: () => triggerDemo(),
      onTeleport: () => win.webContents.send('capri:command', { name: 'teleport' }),
      onQuit: () => app.quit(),
    });
    tray.init(projectRoot);

    // 5. Wire WebSocket server messages to Overlay
    wsServer.onMessage((msg) => {
      if (msg.type === 'session_start') {
        logger.info('[main] Brain reported session_start. System is ONLINE.');
        tray?.setOnlineStatus(true);
      } else if (msg.type === 'session_offline') {
        logger.warn('[main] Brain reported session_offline. System is OFFLINE.');
        tray?.setOnlineStatus(false);
      }

      if (!win.isDestroyed()) {
        win.webContents.send('brain:event', msg);
      }
    });

    // 6. Global Shortcuts
    try {
      globalShortcut.register('Control+Alt+C', () => toggleVisible());
    } catch (err) {
      logger.error('[main] Failed to register Control+Alt+C shortcut:', err);
    }

    // 7. Register IPC handlers
    registerIpc();

    // 7b. Start Window Geometry Watcher (Win32)
    windowWatch = startWindowWatch(win, (snapshot) => {
      if (!win.isDestroyed()) {
        win.webContents.send('window:update', snapshot);
      }
    });

    // 8. Screen & Power monitoring
    screen.on('display-metrics-changed', () => overlay?.fitOverlay());
    screen.on('display-added', () => overlay?.fitOverlay());
    screen.on('display-removed', () => overlay?.fitOverlay());

    powerMonitor.on('resume', () => setTimeout(() => overlay?.rearm(), 2000));
    powerMonitor.on('unlock-screen', () => setTimeout(() => overlay?.rearm(), 1000));

    // Check for --demo or --capture flags
    const captureArg = process.argv.find((a) => a.startsWith('--capture'));
    if (process.argv.includes('--demo') || captureArg) {
      setTimeout(() => triggerDemo(), 1500);
    }

    if (captureArg) {
      setTimeout(async () => {
        try {
          const screensDir = path.join(projectRoot, 'docs', 'screens');
          fs.mkdirSync(screensDir, { recursive: true });
          let targetName = 'stage1-demo.png';
          if (captureArg.includes('=')) {
            targetName = captureArg.split('=')[1];
          } else if (process.env.CAPTURE_FILE) {
            targetName = process.env.CAPTURE_FILE;
          }
          const screenFile = path.join(screensDir, targetName);
          logger.info(`[main] Capturing overlay screenshot to ${screenFile}...`);
          const image = await win.webContents.capturePage();
          fs.writeFileSync(screenFile, image.toPNG());
          logger.info('[main] Screenshot saved successfully. Exiting.');
        } catch (err) {
          logger.error('[main] Screenshot capture failed:', err);
        } finally {
          app.quit();
        }
      }, 5000);
    }
  });

  app.on('will-quit', async (e) => {
    logger.info('[main] Capri Host will quit. Cleaning up child processes...');
    globalShortcut.unregisterAll();
    windowWatch?.stop();
    overlay?.destroy();
    tray?.destroy();

    if (brain) {
      e.preventDefault();
      await brain.stop();
      if (wsServer) {
        await wsServer.close();
      }
      app.exit(0);
    }
  });

  app.on('window-all-closed', () => {
    // Keep app running in tray even when overlay is hidden
  });
}

function toggleVisible(force?: boolean): void {
  const cfg = loadConfig();
  const nextVisible = typeof force === 'boolean' ? force : !cfg.visible;
  saveConfig({ visible: nextVisible });

  if (overlay && overlay.window) {
    if (nextVisible) {
      overlay.window.showInactive();
      overlay.rearm();
    } else {
      overlay.window.webContents.send('capri:command', { name: 'stow', on: true });
    }
  }
  tray?.rebuildMenu();
}

function triggerDemo(): void {
  logger.info('[main] Triggering demo sequence...');
  overlay?.window?.webContents.send('demo:start');
}

function registerIpc(): void {
  ipcMain.on('overlay:interactive', (_e, on: boolean) => {
    overlay?.setInteractive(Boolean(on));
  });

  ipcMain.on('overlay:near-target', (_e, near: boolean) => {
    overlay?.setNearTarget(Boolean(near));
  });

  ipcMain.on('overlay:rearm', () => {
    overlay?.rearm();
  });

  ipcMain.on('overlay:focus', (_e, on: boolean) => {
    overlay?.setFocusable(Boolean(on));
  });

  ipcMain.handle('overlay:cursor', () => {
    return overlay?.getCursorRelative() ?? { x: 0, y: 0, inside: false };
  });

  ipcMain.handle('config:get', () => {
    return loadConfig();
  });

  ipcMain.handle('config:set', (_e, patch: Partial<CapriConfig>) => {
    const updated = saveConfig(patch);
    overlay?.window?.webContents.send('config:changed', updated);
    tray?.rebuildMenu();
    return updated;
  });

  ipcMain.on('brain:send', (_e, msg: Record<string, unknown>) => {
    wsServer?.sendToBrain(msg);
  });

  ipcMain.on('app:quit', () => {
    app.quit();
  });

  ipcMain.on('demo:trigger', () => {
    triggerDemo();
  });
}
