import crypto from 'node:crypto';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from './logger';

export interface BrainMessageListener {
  (message: Record<string, unknown>): void;
}

export class CapriWsServer {
  public readonly port: number;
  public readonly token: string;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private activeSocket: WebSocket | null = null;
  private listeners: Set<BrainMessageListener> = new Set();
  private pingTimer: NodeJS.Timeout | null = null;
  private isAlive = false;

  private constructor(httpServer: http.Server, wss: WebSocketServer, port: number, token: string) {
    this.httpServer = httpServer;
    this.wss = wss;
    this.port = port;
    this.token = token;
    this.setupSocketServer();
  }

  public static async create(): Promise<CapriWsServer> {
    const token = crypto.randomBytes(32).toString('hex');
    const httpServer = http.createServer((_req, res) => {
      // Reject non-websocket HTTP requests
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    const wss = new WebSocketServer({ noServer: true });

    return new Promise((resolve, reject) => {
      // Bind to 127.0.0.1 on a random available port (port 0)
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (!addr || typeof addr === 'string') {
          return reject(new Error('Failed to obtain server address'));
        }
        const port = addr.port;
        logger.info(`[ws-server] Bound to 127.0.0.1:${port}`);
        resolve(new CapriWsServer(httpServer, wss, port, token));
      });

      httpServer.on('error', reject);
    });
  }

  private setupSocketServer(): void {
    this.httpServer.on('upgrade', (req, socket, head) => {
      // Reject any request with an Origin header (cross-site browser tabs)
      if (req.headers.origin) {
        logger.warn(`[ws-server] Rejected connection with Origin header: ${req.headers.origin}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => {
      logger.info('[ws-server] Client connected. Waiting for handshake...');
      let authenticated = false;

      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          logger.warn('[ws-server] Handshake timeout. Closing connection.');
          ws.close(4403, 'Handshake timeout');
        }
      }, 3000);

      ws.on('message', (data) => {
        try {
          const raw = data.toString('utf-8');
          const msg = JSON.parse(raw);

          if (!authenticated) {
            if (msg.type === 'handshake' && msg.token === this.token) {
              authenticated = true;
              clearTimeout(authTimeout);
              this.activeSocket = ws;
              this.isAlive = true;
              logger.info('[ws-server] Client authenticated successfully.');
              this.startHeartbeat();
              return;
            } else {
              logger.warn('[ws-server] Invalid token received in handshake.');
              ws.close(4403, 'Invalid token');
              return;
            }
          }

          // Handle heartbeat pong
          if (msg.type === 'pong') {
            this.isAlive = true;
            return;
          }

          // Notify subscribers
          for (const listener of this.listeners) {
            try {
              listener(msg);
            } catch (err) {
              logger.error('[ws-server] Listener error:', err);
            }
          }
        } catch (err) {
          logger.error('[ws-server] Failed to parse message:', err);
        }
      });

      ws.on('close', (code, reason) => {
        logger.info(`[ws-server] Client disconnected (code: ${code}, reason: ${reason})`);
        clearTimeout(authTimeout);
        if (this.activeSocket === ws) {
          this.activeSocket = null;
          this.stopHeartbeat();
          // Notify that link is offline
          for (const listener of this.listeners) {
            listener({ type: 'session_offline' });
          }
        }
      });

      ws.on('error', (err) => {
        logger.error('[ws-server] Socket error:', err);
      });
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!this.isAlive) {
        logger.warn('[ws-server] Heartbeat missed. Terminating connection.');
        this.activeSocket.terminate();
        return;
      }
      this.isAlive = false;
      this.sendToBrain({ type: 'ping', timestamp: Date.now() });
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public onMessage(listener: BrainMessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public sendToBrain(message: Record<string, unknown>): boolean {
    if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
      logger.warn('[ws-server] Cannot send: no authenticated client connected.');
      return false;
    }
    try {
      this.activeSocket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      logger.error('[ws-server] Send failed:', err);
      return false;
    }
  }

  public get isConnected(): boolean {
    return this.activeSocket !== null && this.activeSocket.readyState === WebSocket.OPEN;
  }

  public close(): Promise<void> {
    this.stopHeartbeat();
    return new Promise((resolve) => {
      if (this.activeSocket) {
        this.activeSocket.close();
      }
      this.wss.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
  }
}
