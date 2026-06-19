/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
import { EventEmitter } from 'node:events';

import WebSocket from 'ws';


import { logger } from '../config/logger';
import {
  WorkerWsRegisterMessage,
  WorkerWsHeartbeatMessage,
  SchedulerWsJobAssignedMessage,
  SchedulerOutgoingMessage,
  WorkerIncomingMessage,
} from '../contracts/worker-protocol.types';
import { normalizeError } from '../utils/errors';


export interface WorkerClientConfig {
  workerId: string;
  serverUrl: string;
  capabilities: string[];
  maxConcurrency: number;
  heartbeatIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

export interface WorkerClientEvents {
  connected: [];
  disconnected: [];
  'heartbeat.ack': [];
  drain: [];
  'job.assigned': [job: SchedulerWsJobAssignedMessage['job']];
  reconnecting: [info: { attempt: number; delay: number }];
  error: [error: Error];
  unknown: [message: Record<string, unknown>];
}

export declare interface WorkerClient {
  on<Event extends keyof WorkerClientEvents>(
    event: Event,
    listener: (...args: WorkerClientEvents[Event]) => void
  ): this;
  emit<Event extends keyof WorkerClientEvents>(
    event: Event,
    ...args: WorkerClientEvents[Event]
  ): boolean;
}

function normalizeConfig(config: WorkerClientConfig): Required<WorkerClientConfig> {
  return {
    workerId: config.workerId,
    serverUrl: config.serverUrl,
    capabilities: config.capabilities,
    maxConcurrency: config.maxConcurrency,
    heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15000,
    reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? 1000,
    reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? 30000,
  };
}

export class WorkerClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private currentLoad = 0;
  private intentionalClose = false;
  private readonly cfg: Required<WorkerClientConfig>;

  constructor(config: WorkerClientConfig) {
    super();
    this.cfg = normalizeConfig(config);
  }

  async connect(): Promise<void> {
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.cfg.serverUrl);

      this.ws.on('open', () => {
        this.reconnectAttempt = 0;
        this.sendRegister();
        this.startHeartbeat();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: Record<string, unknown> = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          this.emit('error', new Error(`Invalid message from server: ${err}`));
        }
      });

      this.ws.on('close', () => {
        this.stopHeartbeat();
        this.ws = null;
        this.emit('disconnected');
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err) => {
        this.emit('error', err);
        if (this.reconnectAttempt === 0) {
          reject(err);
        }
      });
    });
  }

  private sendRegister(): void {
    const msg: WorkerWsRegisterMessage = {
      type: 'register',
      workerId: this.cfg.workerId,
      address: '',
      port: 0,
      capabilities: this.cfg.capabilities,
      maxConcurrency: this.cfg.maxConcurrency,
    };
    this.send(msg);
  }

  sendHeartbeat(currentLoad: number): void {
    this.currentLoad = currentLoad;
    const msg: WorkerWsHeartbeatMessage = {
      type: 'heartbeat',
      workerId: this.cfg.workerId,
      currentLoad,
    };
    this.send(msg);
  }

  private handleMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case 'job.assigned':
        this.emit('job.assigned', (message as unknown as SchedulerWsJobAssignedMessage).job);
        break;
      case 'heartbeat.ack':
        this.emit('heartbeat.ack');
        break;
      case 'drain':
        this.emit('drain');
        break;
      default:
        this.emit('unknown', message);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat(this.currentLoad);
    }, this.cfg.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.cfg.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempt),
      this.cfg.reconnectMaxDelayMs
    );
    this.reconnectAttempt++;
    this.emit('reconnecting', { attempt: this.reconnectAttempt, delay });

    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch(err => logger.warn('Failed to reconnect worker client', { attempt: this.reconnectAttempt, err: normalizeError(err) }));
    }, delay);
  }

  send(data: SchedulerOutgoingMessage | WorkerIncomingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get workerId(): string {
    return this.cfg.workerId;
  }
}
