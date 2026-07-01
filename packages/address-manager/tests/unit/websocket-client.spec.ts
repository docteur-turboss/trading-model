import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

// Mock WebSocket before importing
const mockWebSocketInstance: Record<string, unknown> = {
  on: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1, // OPEN
};
const mockWebSocket = jest.fn(() => mockWebSocketInstance) as jest.Mock & {
  OPEN: number;
  CONNECTING: number;
};
mockWebSocket.OPEN = 1;
mockWebSocket.CONNECTING = 0;
jest.mock('ws', () => ({
  __esModule: true,
  default: mockWebSocket,
}));

const mockWarn = jest.fn();
jest.mock('@trading-model/common/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: mockWarn,
    error: jest.fn(),
  },
}));
import { WebSocketClient } from '../../src/client/websocket-client';

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebSocketInstance.readyState = mockWebSocket.OPEN;
    client = new WebSocketClient('ws://localhost:3000');
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('connect', () => {
    test('should create a new WebSocket connection', () => {
      client.connect();
      expect(mockWebSocket).toHaveBeenCalledWith('ws://localhost:3000');
    });

    test('should not create duplicate connections', () => {
      client.connect();
      client.connect();
      expect(mockWebSocket).toHaveBeenCalledTimes(1);
    });

    test('should register event handlers on the WebSocket', () => {
      client.connect();
      const onMock = mockWebSocketInstance.on as jest.Mock;
      expect(onMock).toHaveBeenCalledWith('open', expect.any(Function));
      expect(onMock).toHaveBeenCalledWith('message', expect.any(Function));
      expect(onMock).toHaveBeenCalledWith('close', expect.any(Function));
      expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('should handle connection errors gracefully', () => {
      mockWebSocket.mockImplementationOnce(() => {
        throw new Error('Connection refused');
      });
      client = new WebSocketClient('ws://bad-host:3000');
      expect(() => client.connect()).not.toThrow();
    });

    test('should handle WebSocket error events gracefully', () => {
      client.connect();
      const onMock = mockWebSocketInstance.on as jest.Mock;
      const errorCall = onMock.mock.calls.find((c: unknown[]) => c[0] === 'error');
      expect(errorCall).toBeDefined();
      if (errorCall) {
        const handler = errorCall[1] as (error: Error) => void;
        expect(() => handler(new Error('test error'))).not.toThrow();
      }
    });

    test('should set reconnectAttempts to 0 and subscribe on open', () => {
      client.connect();
      const onMock = mockWebSocketInstance.on as jest.Mock;
      const openCall = onMock.mock.calls.find((c: unknown[]) => c[0] === 'open');
      expect(openCall).toBeDefined();
      if (openCall) {
        const handler = openCall[1] as () => void;
        mockWebSocketInstance.readyState = mockWebSocket.OPEN;
        handler();
      }
      expect(client.getReconnectAttempts()).toBe(0);
      const sendMock = mockWebSocketInstance.send as jest.Mock;
      expect(sendMock).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', payload: { services: ['*'] } })
      );
    });
  });

  describe('isConnected', () => {
    test('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    test('should return true when connected and readyState is OPEN', () => {
      client.connect();
      expect(client.isConnected()).toBe(true);
    });

    test('should return false when readyState is not OPEN', () => {
      mockWebSocketInstance.readyState = mockWebSocket.CONNECTING;
      client.connect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('send', () => {
    test('should send JSON message when connected', () => {
      client.connect();
      const sendMock = mockWebSocketInstance.send as jest.Mock;
      const result = client.send('heartbeat', { serviceName: 'test' });
      expect(result).toBe(true);
      expect(sendMock).toHaveBeenCalledWith(
        JSON.stringify({ type: 'heartbeat', payload: { serviceName: 'test' } })
      );
    });

    test('should return false when not connected', () => {
      const sendMock = mockWebSocketInstance.send as jest.Mock;
      const result = client.send('heartbeat', { serviceName: 'test' });
      expect(result).toBe(false);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('onMessage', () => {
    test('should invoke handler when message is received', () => {
      const handler = jest.fn();
      client.onMessage(handler);
      client.connect();

      const onMock = mockWebSocketInstance.on as jest.Mock;
      const messageCall = onMock.mock.calls.find((c: unknown[]) => c[0] === 'message');
      expect(messageCall).toBeDefined();
      if (messageCall) {
        const msgHandler = messageCall[1] as (data: Buffer) => void;
        msgHandler(Buffer.from(JSON.stringify({ type: 'heartbeat', payload: {} })));
        expect(handler).toHaveBeenCalledWith({ type: 'heartbeat', payload: {} });
      }
    });

    test('should not throw on invalid JSON', () => {
      const handler = jest.fn();
      client.onMessage(handler);
      client.connect();

      const onMock = mockWebSocketInstance.on as jest.Mock;
      const messageCall = onMock.mock.calls.find((c: unknown[]) => c[0] === 'message');
      expect(messageCall).toBeDefined();
      if (messageCall) {
        const msgHandler = messageCall[1] as (data: Buffer) => void;
        expect(() => msgHandler(Buffer.from('invalid json'))).not.toThrow();
        expect(handler).not.toHaveBeenCalled();
      }
    });
  });

  describe('disconnect', () => {
    test('should close WebSocket and clear reconnect timer', () => {
      client.connect();
      client.disconnect();
      const closeMock = mockWebSocketInstance.close as jest.Mock;
      expect(closeMock).toHaveBeenCalled();
    });

    test('should be safe to call when not connected', () => {
      expect(() => client.disconnect()).not.toThrow();
    });
  });

  describe('getReconnectAttempts', () => {
    test('should return 0 initially', () => {
      expect(client.getReconnectAttempts()).toBe(0);
    });

    test('should increment on close', () => {
      client.connect();
      const onMock = mockWebSocketInstance.on as jest.Mock;
      const closeCall = onMock.mock.calls.find((c: unknown[]) => c[0] === 'close');
      expect(closeCall).toBeDefined();
      if (closeCall) {
        const handler = closeCall[1] as () => void;
        handler();
      }
      expect(client.getReconnectAttempts()).toBe(1);
    });

    test('should log warning when max reconnect attempts reached', () => {
      client = new WebSocketClient('ws://localhost:3000', 5000, ['*'], undefined, 3);

      client.connect();
      const onMock = mockWebSocketInstance.on as jest.Mock;
      const closeHandler = onMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'close'
      )![1] as () => void;

      for (let i = 0; i <= 3; i++) {
        closeHandler();
      }

      expect(mockWarn).toHaveBeenCalledWith(
        'WebSocket max reconnect attempts reached',
        expect.objectContaining({
          url: 'ws://localhost:3000',
          attempts: 3,
        })
      );
    });

    test('should call connect again when reconnect timer fires', () => {
      jest.useFakeTimers();
      client = new WebSocketClient('ws://localhost:3000', 50, ['*'], undefined, 5);

      client.connect();
      expect(mockWebSocket).toHaveBeenCalledTimes(1);

      const onMock = mockWebSocketInstance.on as jest.Mock;
      const closeHandler = onMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'close'
      )![1] as () => void;
      closeHandler();

      expect(client.getReconnectAttempts()).toBe(1);

      jest.advanceTimersByTime(50);

      expect(mockWebSocket).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    test('should not reconnect when disconnect was called before close', () => {
      client = new WebSocketClient('ws://localhost:3000', 5000, ['*'], undefined, 10);
      client.connect();

      client.disconnect();

      const onMock = mockWebSocketInstance.on as jest.Mock;
      const closeHandler = onMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'close'
      )![1] as () => void;
      closeHandler();

      expect(client.getReconnectAttempts()).toBe(0);
    });
  });
});
