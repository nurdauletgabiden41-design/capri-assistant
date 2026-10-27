import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { logger } from './logger';

export class BrainProcessManager {
  private child: ChildProcess | null = null;
  private port: number;
  private token: string;
  private isStopping = false;
  private restartAttempts = 0;
  private maxRestarts = 3;
  private restartTimer: NodeJS.Timeout | null = null;
  private projectRoot: string;

  constructor(port: number, token: string, projectRoot?: string) {
    this.port = port;
    this.token = token;
    this.projectRoot = projectRoot || path.resolve(app.getAppPath());
  }

  private findExecutable(): { bin: string; args: string[]; cwd: string } {
    // 1. Packaged distribution: brain.exe in resources/brain
    if (app.isPackaged) {
      const packagedExe = path.join(process.resourcesPath, 'brain', 'brain.exe');
      if (fs.existsSync(packagedExe)) {
        return { bin: packagedExe, args: [], cwd: path.dirname(packagedExe) };
      }
    }

    // 2. Local standalone build: brain/dist/brain/brain.exe
    const distExe = path.join(this.projectRoot, 'brain', 'dist', 'brain', 'brain.exe');
    if (fs.existsSync(distExe)) {
      return { bin: distExe, args: [], cwd: path.dirname(distExe) };
    }

    // 3. Local virtualenv Python
    const venvWin = path.join(this.projectRoot, '.venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(this.projectRoot, 'brain', 'main.py');
    if (fs.existsSync(venvWin)) {
      return { bin: venvWin, args: ['-u', scriptPath], cwd: this.projectRoot };
    }

    const venvUnix = path.join(this.projectRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(venvUnix)) {
      return { bin: venvUnix, args: ['-u', scriptPath], cwd: this.projectRoot };
    }

    return {
      bin: process.platform === 'win32' ? 'python.exe' : 'python3',
      args: ['-u', scriptPath],
      cwd: this.projectRoot,
    };
  }

  public start(): void {
    if (this.child || this.isStopping) return;

    const { bin, args, cwd } = this.findExecutable();
    const logDir = path.join(app.getPath('appData'), 'Capri', 'logs');

    logger.info(`[brain-process] Launching ${bin} (args: ${args.join(' ')})...`);

    const env = {
      ...process.env,
      CAPRI_WS_PORT: String(this.port),
      CAPRI_WS_TOKEN: this.token,
      CAPRI_LOG_DIR: logDir,
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: this.projectRoot,
    };

    try {
      this.child = spawn(bin, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.child.stdout?.on('data', (data) => {
        const text = data.toString('utf-8').trim();
        if (text) logger.info(`[brain-stdout] ${text}`);
      });

      this.child.stderr?.on('data', (data) => {
        const text = data.toString('utf-8').trim();
        if (text) logger.warn(`[brain-stderr] ${text}`);
      });

      this.child.on('error', (err) => {
        logger.error('[brain-process] Failed to spawn process:', err);
      });

      this.child.on('exit', (code, signal) => {
        logger.warn(`[brain-process] Process exited (code: ${code}, signal: ${signal})`);
        this.child = null;

        if (!this.isStopping && this.restartAttempts < this.maxRestarts) {
          const delay = Math.pow(2, this.restartAttempts) * 1000;
          this.restartAttempts++;
          logger.info(`[brain-process] Scheduling restart #${this.restartAttempts} in ${delay}ms...`);
          this.restartTimer = setTimeout(() => this.start(), delay);
        } else if (this.restartAttempts >= this.maxRestarts) {
          logger.error('[brain-process] Maximum restart attempts reached. Brain stays offline.');
        }
      });
    } catch (err) {
      logger.error('[brain-process] Spawn exception:', err);
    }
  }

  public stop(): Promise<void> {
    this.isStopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (!this.child) return Promise.resolve();

    return new Promise((resolve) => {
      const child = this.child;
      this.child = null;

      if (!child || child.killed) {
        return resolve();
      }

      logger.info('[brain-process] Terminating Python brain child process...');
      child.kill('SIGTERM');

      const forceKillTimer = setTimeout(() => {
        if (!child.killed) {
          logger.warn('[brain-process] Forcing process termination (SIGKILL)...');
          child.kill('SIGKILL');
        }
        resolve();
      }, 2000);

      child.once('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });
  }
}
