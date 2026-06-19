import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

const mockListenExpress = jest.fn();
const mockMessageManagerInstance = {
  listenExpress: mockListenExpress,
};

jest.mock('../../src/index', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockMessageManagerInstance),
}));

jest.mock('@trading-model/address-manager', () => ({}));

import { createMessageManager } from '../../src/shared/helper/create-message-manager';

describe('createMessageManager', () => {
  const options = {
    addressManagerClient: {} as any,
    CertificatePath: '/path/to/cert.pem',
    instanceId: '550e8400-e29b-41d4-a716-446655440000',
    KeyCertificatePath: '/path/to/key.pem',
    RootCACertPath: '/path/to/ca.pem',
    serviceName: ServiceInstanceName.MessageDeliveryService,
    callbackPath: '/callback',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a MessageManager instance with correct options', () => {
    const MessageManagerClass = require('../../src/index').default;

    createMessageManager(options);

    expect(MessageManagerClass).toHaveBeenCalledWith({
      addressManagerClient: options.addressManagerClient,
      CertificatePath: options.CertificatePath,
      instanceId: options.instanceId,
      KeyCertificatePath: options.KeyCertificatePath,
      RootCACertPath: options.RootCACertPath,
      serviceName: options.serviceName,
      callbackPath: options.callbackPath,
    });
  });

  it('should return MessageManager instance and bound listenExpress', () => {
    const result = createMessageManager(options);

    expect(result.MessageManager).toBe(mockMessageManagerInstance);
    expect(result.MessageManagerListenExpress).toBeDefined();

    result.MessageManagerListenExpress({} as any);
    expect(mockListenExpress).toHaveBeenCalledWith({});
  });

  it('should return a bound listenExpress function', () => {
    const result = createMessageManager(options);

    expect(typeof result.MessageManagerListenExpress).toBe('function');
    expect(result.MessageManagerListenExpress.name).toContain('bound');
  });
});
