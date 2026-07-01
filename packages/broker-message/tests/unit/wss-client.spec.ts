import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WssClient } from '../../src/client/wss-client';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('WssClient', () => {
  let client: WssClient;

  const mockConfig = {
    wssUrl: 'wss://localhost:3000/ws',
    httpFallbackUrl: 'https://localhost:3001',
    tlsConfig: {},
    serviceName: 'TestService',
    instanceId: 'test-instance',
  };

  beforeEach(() => {
    client = new WssClient(mockConfig);
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should create instance', () => {
    expect(client).toBeInstanceOf(WssClient);
  });

  it('should not be connected initially', () => {
    expect(client.isConnected()).toBe(false);
  });

  it('should set HTTP fallback function', () => {
    const fallback = jest.fn();
    client.setHttpFallback(fallback);
    expect(client['httpFallback']).toBe(fallback);
  });

  it('should register message handler', () => {
    const handler = jest.fn();
    client.onMessage(handler);
    expect(client['messageHandler']).toBe(handler);
  });

  it('should disconnect gracefully', () => {
    client.disconnect();
    expect(client.isConnected()).toBe(false);
    expect(client['shouldReconnect']).toBe(false);
  });

  it('should allow ack/nack even when disconnected', () => {
    expect(client.ack('msg-1')).toBe(false);
    expect(client.nack('msg-1')).toBe(false);
  });
});
