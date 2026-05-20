import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@trading-model/address-manager/create-address-manager', () => ({
  createAddressManager: jest.fn(() => ({
    start: jest.fn(() => ({ stop: jest.fn() })),
    listenExpress: jest.fn(),
  })),
}));

jest.mock('../../../src/config/env', () => ({
  env: {},
}));

import {
  bootstrapAddressManager,
  AddressManagerRoutes,
  AddressManager,
} from '../../../src/config/address-manager';

describe('config/address-manager', () => {
  it('should export bootstrapAddressManager', () => {
    expect(bootstrapAddressManager).toBeDefined();
  });

  it('should export AddressManagerRoutes', () => {
    expect(AddressManagerRoutes).toBeDefined();
  });

  it('should export AddressManager', () => {
    expect(AddressManager).toBeDefined();
  });
});
