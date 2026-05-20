import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@trading-model/broker-message', () =>
  jest.fn(() => ({
    listenExpress: jest.fn(),
  }))
);

jest.mock('../../../src/config/address-manager', () => ({
  AddressManager: {},
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    TLS_CERT_PATH: '/etc/tls/cert.pem',
    INSTANCE_ID: 'instance-1',
    TLS_KEY_PATH: '/etc/tls/key.pem',
    TLS_CA_PATH: '/etc/tls/ca.pem',
    SERVICE_NAME: 'financial-scraper-service',
    MESSAGE_CALLBACK_PATH: 'message',
  },
}));

import { MessageManager, MessageManagerListenExpress } from '../../../src/config/message-manager';

describe('config/message-manager', () => {
  it('should export MessageManager', () => {
    expect(MessageManager).toBeDefined();
  });

  it('should export MessageManagerListenExpress', () => {
    expect(MessageManagerListenExpress).toBeDefined();
  });
});
