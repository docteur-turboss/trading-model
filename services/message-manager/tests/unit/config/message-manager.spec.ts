import { describe, it, expect, jest } from '@jest/globals';

jest.mock('messaging', () => {
  const mockListen = jest.fn();
  const mockBrokerModule = jest.fn(() => ({ listen: mockListen }));
  return {
    __esModule: true,
    default: mockBrokerModule,
  };
});

jest.mock('../../../src/config/env', () => ({
  env: {
    TLS_CERT_PATH: '/etc/tls/cert.pem',
    TLS_KEY_PATH: '/etc/tls/key.pem',
    TLS_CA_PATH: '/etc/tls/ca.pem',
  },
}));

import { MessageManagerRoutes } from '../../../src/config/message-manager';

describe('config/message-manager', () => {
  it('should export MessageManagerRoutes', () => {
    expect(MessageManagerRoutes).toBeDefined();
  });
});
