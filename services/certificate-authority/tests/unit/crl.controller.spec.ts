import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGetAll = jest.fn();

jest.mock('../../src/app/container', () => ({
  container: {
    crlStore: {
      getAll: mockGetAll,
    },
  },
}));

import { getCrl } from '../../src/controllers/crl.controller';

describe('crl.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return CRL with entries', async () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const req = {} as any;
    const res = { status } as any;

    const entries = [
      { serialNumber: 'SN-001', serviceId: 'svc-1', revokedAt: new Date(), reason: 'test' },
    ];
    mockGetAll.mockResolvedValue(entries);

    await getCrl(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.status().json).toHaveBeenCalledWith({
      lastUpdate: expect.any(Date),
      entries,
    });
  });

  it('should return empty entries when none revoked', async () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const req = {} as any;
    const res = { status } as any;

    mockGetAll.mockResolvedValue([]);

    await getCrl(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.status().json).toHaveBeenCalledWith({
      lastUpdate: expect.any(Date),
      entries: [],
    });
  });

  it('should return 500 on error', async () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const req = {} as any;
    const res = { status } as any;

    mockGetAll.mockRejectedValue(new Error('DB error'));

    await getCrl(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
