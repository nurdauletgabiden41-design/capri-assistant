import path from 'node:path';
import { Menu, nativeImage, Tray } from 'electron';
import { loadConfig, saveConfig } from './config';
import { logger } from './logger';

export interface TrayCallbacks {
  onToggleVisible: () => void;
  onPlayDemo: () => void;
  onTeleport: () => void;
  onQuit: () => void;
}

export class TrayManager {
  public tray: Tray | null = null;
  private callbacks: TrayCallbacks;
  private isOnline = false;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
  }

  public init(projectRoot: string): void {
    const iconPath = path.join(projectRoot, 'app', 'assets', 'icons', 'tray.png');
    let image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      logger.warn(`[tray] Icon not found at ${iconPath}, creating blank fallback icon.`);
      image = nativeImage.createEmpty();
    }

    this.tray = new Tray(image);
    this.tray.setToolTip('Capri Assistant');
    this.tray.on('click', () => this.callbacks.onToggleVisible());
    this.rebuildMenu();
  }

  public setOnlineStatus(online: boolean): void {
    this.isOnline = online;
    this.rebuildMenu();
  }

  public rebuildMenu(): void {
    if (!this.tray) return;

    const cfg = loadConfig();
    const statusLabel = this.isOnline ? 'Capri: Online' : 'Capri: Offline (Brain disconnected)';

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      { label: 'Демо-режим (Demo)', click: () => this.callbacks.onPlayDemo() },
      { label: 'Телепорт сюда (Teleport)', click: () => this.callbacks.onTeleport() },
      {
        label: cfg.visible ? 'Спрятать (Hide)' : 'Показать (Show)',
        accelerator: 'Control+Alt+C',
        click: () => this.callbacks.onToggleVisible(),
      },
      { type: 'separator' },
      {
        label: 'Масштаб (Size)',
        submenu: [
          { label: 'Маленький (Small)', type: 'radio', checked: cfg.scale === 0.45, click: () => saveConfig({ scale: 0.45 }) },
          { label: 'Обычный (Medium)', type: 'radio', checked: cfg.scale === 0.60, click: () => saveConfig({ scale: 0.60 }) },
          { label: 'Большой (Large)', type: 'radio', checked: cfg.scale === 0.80, click: () => saveConfig({ scale: 0.80 }) },
        ],
      },
      {
        label: 'Звук (Mute)',
        type: 'checkbox',
        checked: cfg.muted,
        click: (item) => saveConfig({ muted: item.checked }),
      },
      { type: 'separator' },
      { label: 'Выход (Quit)', click: () => this.callbacks.onQuit() },
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(contextMenu);
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
