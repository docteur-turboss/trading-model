import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@trading-model/common/server/bootstrap', () => ({
  createBootstrap: jest.fn(),
}));

jest.mock('../../src/core/lease-manager', () => ({
  LeaseManagerInstance: {
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('../../src/app/server', () => ({
  createServer: jest.fn(),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    PORT: 3000,
    TLS_KEY_PATH: '/key',
    TLS_CERT_PATH: '/cert',
    TLS_CA_PATH: '/ca',
    ERROR_URL_WEBHOOK: 'https://hooks.example.com/error',
  },
}));

describe('app/index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call createBootstrap with correct options on load', () => {
    const { createBootstrap } = jest.requireMock('@trading-model/common/server/bootstrap') as {
      createBootstrap: jest.Mock;
    };
    const { LeaseManagerInstance } = jest.requireMock('../../src/core/lease-manager') as {
      LeaseManagerInstance: { start: jest.Mock; stop: jest.Mock };
    };
    const { createServer } = jest.requireMock('../../src/app/server') as {
      createServer: jest.Mock;
    };

    require('../../src/app/index');

    expect(createBootstrap).toHaveBeenCalledTimes(1);
    expect(createBootstrap).toHaveBeenCalledWith({
      name: 'Discovery',
      createServer,
      onStart: expect.any(Function),
      onStop: expect.any(Function),
    });

    const opts = createBootstrap.mock.calls[0][0] as {
      onStart: () => void;
      onStop: () => void;
    };

    opts.onStart();
    expect(LeaseManagerInstance.start).toHaveBeenCalled();

    opts.onStop();
    expect(LeaseManagerInstance.stop).toHaveBeenCalled();
  });
});
