import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

jest.mock('ws', () => {
  const MockWebSocket = jest.fn(() => ({
    on: jest.fn(),
    send: jest.fn(),
    get readyState() { return 1; },
    close: jest.fn(),
  }));

  (MockWebSocket as any).OPEN = 1;
  (MockWebSocket as any).CONNECTING = 0;
  (MockWebSocket as any).CLOSING = 2;
  (MockWebSocket as any).CLOSED = 3;

  return {
    __esModule: true,
    default: MockWebSocket,
    WebSocketServer: jest.fn(),
  };
});

import WebSocket from 'ws';
const MockWebSocket = WebSocket as unknown as jest.Mock<any>;

import { WorkerClient } from '../../../src/worker/worker-client';

function getWs(): any {
  const entry = MockWebSocket.mock.results[0];
  return entry ? entry.value : undefined;
}

function getCallbacks(ws: any) {
  const onCalls = ws.on.mock.calls;
  return {
    open: onCalls.find((c: any) => c[0] === 'open')?.[1] as () => void,
    message: onCalls.find((c: any) => c[0] === 'message')?.[1] as (data: string) => void,
    close: onCalls.find((c: any) => c[0] === 'close')?.[1] as () => void,
    error: onCalls.find((c: any) => c[0] === 'error')?.[1] as (err: Error) => void,
  };
}

async function openConnection(client: WorkerClient): Promise<void> {
  const promise = client.connect();
  const ws = getWs();
  if (ws) getCallbacks(ws).open();
  await promise;
}

describe('WorkerClient', () => {
  let client: WorkerClient;
  let onJobAssigned: jest.Mock;
  let onDrain: jest.Mock;
  let onConnected: jest.Mock;
  let onDisconnected: jest.Mock;
  let onError: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    client = new WorkerClient({
      workerId: 'test-worker',
      serverUrl: 'wss://scheduler:3000',
      capabilities: ['type-a', 'type-b'],
      maxConcurrency: 5,
      heartbeatIntervalMs: 5000,
    });

    onJobAssigned = jest.fn();
    onDrain = jest.fn();
    onConnected = jest.fn();
    onDisconnected = jest.fn();
    onError = jest.fn();

    client.on('job.assigned', onJobAssigned);
    client.on('drain', onDrain);
    client.on('connected', onConnected);
    client.on('disconnected', onDisconnected);
    client.on('error', onError);
  });

  afterEach(() => {
    jest.useRealTimers();
    client.disconnect();
  });

  describe('connect', () => {
    it('should create a WebSocket connection to the server URL', async () => {
      await openConnection(client);

      expect(MockWebSocket).toHaveBeenCalledWith('wss://scheduler:3000');
      expect(onConnected).toHaveBeenCalled();
    });

    it('should send register message on open', async () => {
      await openConnection(client);
      const ws = getWs();

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'register',
          workerId: 'test-worker',
          address: '',
          port: 0,
          capabilities: ['type-a', 'type-b'],
          maxConcurrency: 5,
        })
      );
    });

    it('should start heartbeat interval after connect', async () => {
      await openConnection(client);
      const ws = getWs();

      jest.clearAllMocks();

      jest.advanceTimersByTime(5000);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'heartbeat',
          workerId: 'test-worker',
          currentLoad: 0,
        })
      );
    });

    it('should reject on first connection error', async () => {
      const promise = client.connect();
      const ws = getWs();
      getCallbacks(ws).error(new Error('Connection refused'));

      await expect(promise).rejects.toThrow('Connection refused');
    });
  });

  describe('message handling', () => {
    it('should emit job.assigned on receiving a job.assigned message', async () => {
      await openConnection(client);
      const ws = getWs();

      const job = { id: 'job-1', type: 'type-a', payload: { key: 'value' }, ackDeadline: 12345 };
      getCallbacks(ws).message!(JSON.stringify({ type: 'job.assigned', job }));

      expect(onJobAssigned).toHaveBeenCalledWith(job);
    });

    it('should emit drain on receiving a drain message', async () => {
      await openConnection(client);
      const ws = getWs();

      getCallbacks(ws).message!(JSON.stringify({ type: 'drain' }));

      expect(onDrain).toHaveBeenCalled();
    });

    it('should emit heartbeat.ack on receiving a heartbeat.ack message', async () => {
      const onHeartbeatAck = jest.fn();
      client.on('heartbeat.ack', onHeartbeatAck);
      await openConnection(client);
      const ws = getWs();

      getCallbacks(ws).message!(JSON.stringify({ type: 'heartbeat.ack' }));

      expect(onHeartbeatAck).toHaveBeenCalled();
    });

    it('should emit unknown for unrecognized message types', async () => {
      const onUnknown = jest.fn();
      client.on('unknown', onUnknown);
      await openConnection(client);
      const ws = getWs();

      getCallbacks(ws).message!(JSON.stringify({ type: 'unknown-type', foo: 'bar' }));

      expect(onUnknown).toHaveBeenCalledWith({ type: 'unknown-type', foo: 'bar' });
    });

    it('should emit error on invalid JSON', async () => {
      await openConnection(client);
      const ws = getWs();

      getCallbacks(ws).message!('not-json');

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('sendHeartbeat', () => {
    it('should send a heartbeat message with current load', async () => {
      await openConnection(client);
      const ws = getWs();

      jest.clearAllMocks();

      client.sendHeartbeat(3);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'heartbeat',
          workerId: 'test-worker',
          currentLoad: 3,
        })
      );
    });
  });

  describe('close and reconnect', () => {
    it('should emit disconnected on WebSocket close', async () => {
      await openConnection(client);
      const ws = getWs();

      getCallbacks(ws).close();

      expect(onDisconnected).toHaveBeenCalled();
    });

    it('should not reconnect after intentional disconnect', async () => {
      await openConnection(client);
      const ws = getWs();

      jest.clearAllMocks();

      client.disconnect();

      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('should send JSON message via WebSocket', async () => {
      await openConnection(client);
      const ws = getWs();

      jest.clearAllMocks();

      client.send({ type: 'heartbeat', workerId: 'test-worker', currentLoad: 1 } as any);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'heartbeat', workerId: 'test-worker', currentLoad: 1 })
      );
    });

    it('should not send if not connected', () => {
      const ws = getWs();

      client.send({ type: 'heartbeat', workerId: 'test-worker', currentLoad: 1 } as any);

      if (ws) {
        expect(ws.send).not.toHaveBeenCalled();
      }
    });
  });

  describe('isConnected', () => {
    it('should return false before connect', () => {
      expect(client.isConnected).toBe(false);
    });

    it('should return true after successful connect', async () => {
      await openConnection(client);
      expect(client.isConnected).toBe(true);
    });

    it('should return false after disconnect', async () => {
      await openConnection(client);
      client.disconnect();
      expect(client.isConnected).toBe(false);
    });
  });

  describe('workerId', () => {
    it('should return the configured worker ID', () => {
      expect(client.workerId).toBe('test-worker');
    });
  });
});

describe('WorkerClient defaults and reconnection', () => {
  let client: WorkerClient;
  let onReconnecting: jest.Mock;
  let onDisconnected: jest.Mock;
  let onError: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    onReconnecting = jest.fn();
    onDisconnected = jest.fn();
    onError = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (client) client.disconnect();
  });

  it('should use default heartbeat interval when not configured', () => {
    client = new WorkerClient({
      workerId: 'default-hb',
      serverUrl: 'wss://scheduler:3000',
      capabilities: ['type-a'],
      maxConcurrency: 3,
    });

    client.connect();
    const ws = getWs();
    if (ws) getCallbacks(ws).open();
    jest.clearAllMocks();

    jest.advanceTimersByTime(15000);

    if (ws) {
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"heartbeat"')
      );
    }
  });

  it('should schedule reconnect on close when not intentional', async () => {
    client = new WorkerClient({
      workerId: 'reconnect-test',
      serverUrl: 'wss://scheduler:3000',
      capabilities: ['type-a'],
      maxConcurrency: 3,
      heartbeatIntervalMs: 5000,
      reconnectBaseDelayMs: 1000,
      reconnectMaxDelayMs: 5000,
    });

    client.on('disconnected', onDisconnected);
    client.on('error', onError);
    client.on('reconnecting', onReconnecting);

    await openConnection(client);
    const ws = getWs();
    const callbacks = getCallbacks(ws);

    jest.clearAllMocks();

    callbacks.close();

    expect(onDisconnected).toHaveBeenCalled();
    expect(onReconnecting).toHaveBeenCalledWith({ attempt: 1, delay: 1000 });
  });

  it('should emit error on reconnect failure without rejecting', async () => {
    client = new WorkerClient({
      workerId: 'reconnect-fail',
      serverUrl: 'wss://scheduler:3000',
      capabilities: ['type-a'],
      maxConcurrency: 3,
      heartbeatIntervalMs: 5000,
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 1000,
    });

    client.on('error', onError);
    client.on('reconnecting', onReconnecting);

    await openConnection(client);
    const ws = getWs();
    const callbacks = getCallbacks(ws);

    jest.clearAllMocks();

    callbacks.close();
    jest.advanceTimersByTime(100);

    const newWs = getWs();
    if (newWs) {
      getCallbacks(newWs).error(new Error('reconnect failed'));
      expect(onError).toHaveBeenCalled();
    }
  });

  it('should not reconnect when intentionalClose is true', async () => {
    client = new WorkerClient({
      workerId: 'intentional-close',
      serverUrl: 'wss://scheduler:3000',
      capabilities: ['type-a'],
      maxConcurrency: 3,
      heartbeatIntervalMs: 5000,
    });

    client.on('disconnected', onDisconnected);
    client.on('reconnecting', onReconnecting);

    await openConnection(client);
    const ws = getWs();
    const callbacks = getCallbacks(ws);

    jest.clearAllMocks();
    (client as any).intentionalClose = true;

    callbacks.close();

    expect(onDisconnected).toHaveBeenCalled();
    expect(onReconnecting).not.toHaveBeenCalled();
  });

  it('should handle promise rejection from doConnect during reconnect', async () => {
    const onReconnectError = jest.fn();

    client = new WorkerClient({
      workerId: 'reconnect-reject',
      serverUrl: 'wss://scheduler:3000',
      capabilities: ['type-a'],
      maxConcurrency: 3,
      reconnectBaseDelayMs: 100,
    });

    client.on('error', onReconnectError);

    await openConnection(client);
    const ws = getWs();
    const callbacks = getCallbacks(ws);

    jest.clearAllMocks();

    callbacks.close();
    (client as any).reconnectAttempt = 0;
    jest.advanceTimersByTime(100);

    const newWs = getWs();
    if (newWs) {
      const cb = getCallbacks(newWs);
      expect(cb.error).toBeDefined();
      cb.error(new Error('connection failed'));
    }
  });
});
