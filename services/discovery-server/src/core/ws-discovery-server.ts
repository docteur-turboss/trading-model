import https from 'node:https';

import WebSocket, { WebSocketServer } from 'ws';

import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

const CLIENT_TIMEOUT_MS = 60_000;

interface ConnectedClient {
  ws: WebSocket;
  subscribedServices: Set<string>;
  instanceId?: string;
  serviceName?: string;
}

interface WsDiscoveryServerOptions {
  path?: string;
}

export class WsDiscoveryServer {
  private wss: WebSocketServer | null = null;
  private readonly path: string;
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly clientTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options?: WsDiscoveryServerOptions) {
    this.path = options?.path ?? '/ws';
  }

  attach(rawServer: https.Server): void {
    this.wss = new WebSocketServer({ noServer: true });

    rawServer.on('upgrade', (request, socket, head) => {
      if (request.url?.startsWith(this.path)) {
        this.wss!.handleUpgrade(request, socket, head, (ws, req) => {
          this.wss!.emit('connection', ws, req);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      logger.info('Discovery WS client connected', { clientId });

      const client: ConnectedClient = {
        ws,
        subscribedServices: new Set(),
      };
      this.clients.set(clientId, client);
      this.resetClientTimeout(clientId, ws);

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as {
            type: string;
            payload?: Record<string, unknown>;
          };
          this.handleMessage(clientId, client, message);
        } catch (error) {
          logger.warn('Failed to parse WS message', { clientId, err: normalizeError(error) });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        const timeout = this.clientTimeouts.get(clientId);
        if (timeout) clearTimeout(timeout);
        this.clientTimeouts.delete(clientId);
        logger.info('Discovery WS client disconnected', { clientId });
      });

      ws.on('error', error => {
        logger.warn('Discovery WS client error', { clientId, err: normalizeError(error) });
      });
    });
  }

  private handleMessage(
    clientId: string,
    client: ConnectedClient,
    message: { type: string; payload?: Record<string, unknown> }
  ): void {
    switch (message.type) {
      case 'subscribe': {
        const services = message.payload?.services;
        if (Array.isArray(services)) {
          for (const s of services) client.subscribedServices.add(String(s));
        } else {
          client.subscribedServices.add('*');
        }
        logger.info('Discovery WS client subscribed', {
          clientId,
          services: [...client.subscribedServices],
        });
        break;
      }
      case 'heartbeat': {
        const payload = message.payload as
          | { serviceName?: string; instanceId?: string }
          | undefined;
        if (payload?.serviceName) client.serviceName = payload.serviceName;
        if (payload?.instanceId) client.instanceId = payload.instanceId;
        break;
      }
      default:
        logger.debug('Unknown WS message type', { clientId, type: message.type });
    }
  }

  notifyServiceChanged(serviceName: string): void {
    this.broadcastInvalidation(serviceName);
  }

  notifyInstanceRemoved(serviceName: string, _instanceId: string): void {
    this.broadcastInvalidation(serviceName);
  }

  private broadcastInvalidation(serviceName: string): void {
    const message = JSON.stringify({
      type: 'cache.invalidate',
      payload: { serviceName },
    });

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (!client.subscribedServices.has('*') && !client.subscribedServices.has(serviceName))
        continue;
      try {
        client.ws.send(message);
      } catch (error) {
        logger.warn('Failed to send cache.invalidate to client', {
          clientId,
          err: normalizeError(error),
        });
      }
    }
  }

  private resetClientTimeout(clientId: string, ws: WebSocket): void {
    const existing = this.clientTimeouts.get(clientId);
    if (existing) clearTimeout(existing);
    this.clientTimeouts.set(
      clientId,
      setTimeout(() => {
        logger.warn('Discovery WS client timed out', { clientId });
        ws.close();
        this.clients.delete(clientId);
        this.clientTimeouts.delete(clientId);
      }, CLIENT_TIMEOUT_MS)
    );
  }

  stop(): void {
    for (const [clientId, client] of this.clients) {
      client.ws.close();
      const timeout = this.clientTimeouts.get(clientId);
      if (timeout) clearTimeout(timeout);
    }
    this.clients.clear();
    this.clientTimeouts.clear();
    this.wss?.close();
    this.wss = null;
  }
}
