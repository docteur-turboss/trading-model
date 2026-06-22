import https from 'node:https';

import WebSocket, { WebSocketServer } from 'ws';

import { WorkerRegistry } from './worker-registry';
import { logger } from '../config/logger';
import {
  SchedulerOutgoingMessage,
  WorkerIncomingMessage,
} from '../contracts/worker-protocol.types';

export class WorkerProtocol {
  private readonly wss: WebSocketServer;
  private readonly connections: Map<string, WebSocket> = new Map();

  constructor(
    server: https.Server,
    private readonly workerRegistry: WorkerRegistry,
    private readonly onWorkerDisconnect: (workerId: string) => void
  ) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: WorkerIncomingMessage = JSON.parse(data.toString());

          switch (message.type) {
            case 'register':
              this.handleRegister(message, ws);
              break;
            case 'heartbeat':
              this.handleHeartbeat(message);
              break;
            case 'disconnect':
              this.handleDisconnect(message);
              break;
          }
        } catch (err) {
          logger.error('Invalid WebSocket message from worker', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      ws.on('close', () => {
        for (const [workerId, conn] of this.connections) {
          if (conn === ws) {
            this.connections.delete(workerId);
            this.workerRegistry.setStatus(workerId, 'draining');
            this.onWorkerDisconnect(workerId);
            break;
          }
        }
      });
    });
  }

  private handleRegister(
    message: WorkerIncomingMessage & { type: 'register' },
    ws: WebSocket
  ): void {
    this.workerRegistry.register(message.workerId, {
      workerId: message.workerId,
      address: message.address,
      port: message.port,
      capabilities: message.capabilities,
      maxConcurrency: message.maxConcurrency,
      currentLoad: 0,
    });
    this.connections.set(message.workerId, ws);

    logger.info('Worker registered via WebSocket', { workerId: message.workerId });
  }

  private handleHeartbeat(message: WorkerIncomingMessage & { type: 'heartbeat' }): void {
    this.workerRegistry.heartbeat(message.workerId);
    this.workerRegistry.updateLoad(message.workerId, message.currentLoad);

    const ws = this.connections.get(message.workerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heartbeat.ack' }));
    }
  }

  private handleDisconnect(message: WorkerIncomingMessage & { type: 'disconnect' }): void {
    this.connections.delete(message.workerId);
    this.workerRegistry.unregister(message.workerId);
    this.onWorkerDisconnect(message.workerId);

    logger.info('Worker disconnected', { workerId: message.workerId, reason: message.reason });
  }

  sendToWorker(workerId: string, message: SchedulerOutgoingMessage): void {
    const ws = this.connections.get(workerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendDrain(workerId: string): void {
    this.sendToWorker(workerId, { type: 'drain' });
  }

  broadcastDrain(): void {
    for (const [workerId] of this.connections) {
      this.sendDrain(workerId);
    }
  }

  close(): void {
    this.broadcastDrain();
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.wss.close();
  }
}
