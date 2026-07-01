import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Server as HttpsServer } from 'https';
import { WssTransport } from '../../../../src/messaging/transport/wss-transport';
import { Dispatcher } from '../../../../src/messaging/core/dispatcher';
import { createMockDispatcher } from '../../../helpers/broker.helper';

jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    MAX_PAYLOAD_BYTES: 5 * 1024 * 1024,
    BROKER_INSTANCE_ID: 'test-broker',
  },
}));

describe('WssTransport', () => {
  let transport: WssTransport;
  let mockDispatcher: jest.Mocked<Dispatcher>;
  let mockServer: HttpsServer;

  beforeEach(() => {
    mockDispatcher = createMockDispatcher();
    transport = new WssTransport(mockDispatcher);
    mockServer = { on: jest.fn(), removeListener: jest.fn() } as unknown as HttpsServer;
  });

  afterEach(async () => {
    await transport.shutdown();
  });

  it('should create instance without server', () => {
    expect(transport).toBeInstanceOf(WssTransport);
    expect(transport.getConnectedCount()).toBe(0);
  });

  it('should attach to HTTPS server', () => {
    const attachSpy = jest.spyOn(transport, 'attach');
    transport.attach(mockServer);
    expect(attachSpy).toHaveBeenCalledWith(mockServer);
  });

  it('should return undefined for unknown subscriber', () => {
    expect(transport.getSubscriber('unknown', 'none')).toBeUndefined();
  });

  it('should return false for unknown subscriber', () => {
    expect(transport.hasSubscriber('unknown', 'none')).toBe(false);
  });

  it('should broadcast to no one when no connections', () => {
    const sent = transport.broadcastToTopic('test.topic', { hello: 'world' });
    expect(sent).toBe(0);
  });

  it('should shutdown gracefully', async () => {
    await transport.shutdown();
    expect(transport.getConnectedCount()).toBe(0);
  });
});
