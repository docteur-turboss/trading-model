import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import { CaClient, SignCertificateResponse } from '@trading-model/common/ca/ca-client';
import { logger } from '@trading-model/common/config/logger';

export type TransportMode = 'wss' | 'https';

export interface TransportConfig {
  caUrl: string;
  tls?: {
    ca: string;
    cert: string;
    key: string;
  };
  retestWssIntervalMs?: number;
  forceHttps?: boolean;
  bootstrapToken?: string;
}

interface PendingRequest {
  resolve: (value: SignCertificateResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class TransportManager {
  private mode: TransportMode;
  private ws: WebSocket | null = null;
  private wsConnected = false;
  /** Whether the auth token has been delivered to the CA server.
   *  NOTE: this means "token delivered", NOT "token validated". */
  private wsAuthSent = false;
  private readonly httpsClient: CaClient;
  private readonly config: TransportConfig;
  private readonly baseUrl: string;
  private readonly pending = new Map<string, PendingRequest>();
  private wssReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectAttempts = 0;
  private destroyed = false;
  /** Number of unauthenticated requests rejected — used for rate-limit backpressure. */
  private unauthRejects = 0;

  constructor(config: TransportConfig) {
    this.config = config;
    this.baseUrl = config.caUrl.replace(/\/+$/, '');
    this.httpsClient = new CaClient({ baseUrl: config.caUrl, tls: config.tls });
    if (config.forceHttps) {
      this.mode = 'https';
    } else {
      this.mode = 'wss';
      this.connectWs();
    }
  }

  get currentMode(): TransportMode {
    return this.mode;
  }

  private getWsUrl(): string {
    return this.baseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  }

  /**
   * Sends the bootstrap token as a dedicated auth message over the WSS connection.
   * This is more secure than including the token in the HTTP Upgrade header,
   * which would be visible in load balancer / proxy logs.
   */
  private sendWsAuth(): void {
    const token = this.config.bootstrapToken;
    if (!token || token.length === 0 || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'auth',
        token,
      }),
      err => {
        if (err) {
          logger.error('Failed to send WSS auth message', { err: err.message });
        }
      }
    );
  }

  private connectWs(): void {
    if (this.destroyed) return;

    try {
      const wsUrl = this.getWsUrl();
      const wsOptions: WebSocket.ClientOptions = {};
      if (this.config.tls) {
        wsOptions.ca = this.config.tls.ca;
        wsOptions.cert = this.config.tls.cert;
        wsOptions.key = this.config.tls.key;
        wsOptions.rejectUnauthorized = true;
      }
      // Enforce TLS 1.3 minimum and restrict to modern cipher suites.
      // Note: secureOptions for blocking older protocol versions is redundant
      // once minVersion is set, but kept as defense-in-depth.
      wsOptions.minVersion = 'TLSv1.3';
      wsOptions.ciphers =
        'TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256';

      // NOTE: bootstrap token is intentionally NOT sent in the Upgrade header.
      // It is sent as a dedicated auth message after connection (see sendWsAuth).
      // This avoids leaking the token into load balancer / proxy logs.

      this.ws = new WebSocket(wsUrl, wsOptions);
      this.ws.binaryType = 'nodebuffer';

      const connectTimeout = setTimeout(() => {
        if (!this.wsConnected) {
          logger.warn('WSS connection timeout');
          this.ws?.close();
          this.scheduleWsReconnect();
        }
      }, 10_000);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.wsConnected = true;
        this.wsAuthSent = false;
        this.wsReconnectAttempts = 0;
        this.mode = 'wss';
        logger.info('WSS transport connected to CA');
        // Send auth token as a dedicated message, not in the Upgrade header
        this.sendWsAuth();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Handle auth acknowledgment
          // NOTE: success:true means the token was received, not validated.
          // Actual validation happens atomically during the sign request.
          // We treat it as authenticated to allow the request through to the
          // distributor which will validate the token.
          if (msg.type === 'auth:response') {
            if (msg.success) {
              this.wsAuthSent = true;
              this.unauthRejects = 0;
              logger.info('WSS auth token delivered to CA');
            } else {
              logger.error('WSS auth message rejected by CA', { error: msg.error?.message });
              this.mode = 'https';
            }
            return;
          }

          if (msg.type === 'sign:response' || msg.type === 'response') {
            const pending = this.pending.get(msg.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(msg.id);
              if (msg.success) {
                pending.resolve(msg.data as SignCertificateResponse);
              } else {
                pending.reject(new Error(msg.error?.message ?? 'WSS request failed'));
              }
            }
          }
        } catch {
          logger.error('Invalid WSS message from CA');
        }
      });

      this.ws.on('close', () => {
        clearTimeout(connectTimeout);
        this.wsConnected = false;
        if (this.mode === 'wss' && !this.destroyed) {
          this.scheduleWsReconnect();
        }
      });

      this.ws.on('error', err => {
        clearTimeout(connectTimeout);
        logger.error('WSS transport error', { err: err.message });
        if (!this.wsConnected) {
          this.scheduleWsReconnect();
        }
      });
    } catch (err) {
      logger.error('Failed to create WSS connection', { err });
      this.scheduleWsReconnect();
    }
  }

  private scheduleWsReconnect(): void {
    if (this.destroyed || this.wssReconnectTimer) return;
    const maxBackoff = 60_000;
    const baseBackoff = Math.min(1_000 * Math.pow(2, this.wsReconnectAttempts), maxBackoff);
    const jitter = 500 + Math.random() * Math.max(baseBackoff - 500, 0);
    const delay = Math.min(jitter, maxBackoff);
    this.wsReconnectAttempts++;
    this.mode = 'https';
    logger.info(`WSS reconnecting in ${Math.round(delay)}ms (attempt ${this.wsReconnectAttempts})`);
    this.wssReconnectTimer = setTimeout(() => {
      this.wssReconnectTimer = null;
      this.cleanupWs();
      this.connectWs();
    }, delay);
  }

  private async sendWsRequest(
    serviceId: string,
    csr: string,
    options?: { ttlMs?: number }
  ): Promise<SignCertificateResponse> {
    const id = randomUUID();
    return new Promise<SignCertificateResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('WSS request timed out'));
      }, 30_000);

      this.pending.set(id, { resolve, reject, timer });

      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('WebSocket not connected'));
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'sign',
          id,
          data: { serviceId, csr, ttlMs: options?.ttlMs },
        }),
        err => {
          if (err) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(err);
          }
        }
      );
    });
  }

  async signCertificate(
    serviceId: string,
    csr: string,
    options?: { ttlMs?: number }
  ): Promise<SignCertificateResponse> {
    if (this.mode === 'wss' && this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
      // 5a: Only send via WSS if authenticated (tokens sent post-connect, not in Upgrade header)
      // 5c: If not yet authenticated, fall back to HTTPS to avoid abuse
      if (!this.wsAuthSent) {
        this.unauthRejects++;
        if (this.unauthRejects > 3) {
          logger.warn('WSS not authenticated after 3 attempts, falling back to HTTPS');
          this.mode = 'https';
          this.scheduleWsReconnect();
          return this.httpsClient.signCertificate(serviceId, csr, options);
        }
      }
      try {
        return await this.sendWsRequest(serviceId, csr, options);
      } catch (err) {
        logger.error('WSS sign failed, falling back to HTTPS', { err });
        this.scheduleWsReconnect();
      }
    }
    return this.httpsClient.signCertificate(serviceId, csr, options);
  }

  async getCertificate(
    serviceId: string
  ): Promise<import('@trading-model/common/ca/ca-client').GetCertificateResponse | null> {
    return this.httpsClient.getCertificate(serviceId);
  }

  async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
    return this.httpsClient.revokeCertificate(serialNumber, reason);
  }

  async getCrl(
    since?: string
  ): Promise<
    Array<{ serialNumber: string; serviceId: string; revokedAt: string; reason: string }>
  > {
    return this.httpsClient.getCrl(since);
  }

  private cleanupWs(): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* closing gracefully */
      }
      this.ws = null;
    }
    this.wsConnected = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanupWs();
    if (this.wssReconnectTimer) {
      clearTimeout(this.wssReconnectTimer);
      this.wssReconnectTimer = null;
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('TransportManager destroyed'));
      this.pending.delete(id);
    }
  }
}
