import { describe, it, expect, jest, beforeEach } from '@jest/globals';

let mockWatcher: any;
let mockWatchCallback: ((eventType: string, filename: string | null) => void) | null;

jest.mock('node:fs', () => {
  mockWatcher = { unref: jest.fn() };
  mockWatchCallback = null;
  return {
    watch: jest.fn((_dir: string, callback: (eventType: string, filename: string | null) => void) => {
      mockWatchCallback = callback;
      return mockWatcher;
    }),
    constants: { R_OK: 4 },
  };
});

jest.mock('node:fs/promises', () => ({
  access: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('mock-cert-content')),
}));

jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  _private: class {},
}));

import { setupTlsWatcher } from '../../src/server/server-factory';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { logger } from '../../src/config/logger';

const tlsConfig = {
  key: '/path/to/key.pem',
  cert: '/path/to/cert.pem',
  ca: '/path/to/ca.pem',
};

const mockServer = {
  setSecureContext: jest.fn(),
} as any;

describe('setupTlsWatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    (fsPromises.readFile as jest.Mock).mockImplementation(() => Promise.resolve('mock-cert-content'));
    (fsPromises.access as jest.Mock).mockImplementation(() => Promise.resolve());
  });

  it('should set up watchers for each unique directory', async () => {
    await setupTlsWatcher(mockServer, tlsConfig);

    expect(fs.watch).toHaveBeenCalledTimes(1);
    expect(fs.watch).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    expect(mockWatcher.unref).toHaveBeenCalled();
  });

  it('should set up watchers for multiple unique directories', async () => {
    const multiDirConfig = {
      key: '/dir1/key.pem',
      cert: '/dir2/cert.pem',
      ca: '/dir3/ca.pem',
    };

    await setupTlsWatcher(mockServer, multiDirConfig);

    expect(fs.watch).toHaveBeenCalledTimes(3);
    expect(mockWatcher.unref).toHaveBeenCalledTimes(3);
  });

  it('should log warning when directory is not readable', async () => {
    (fsPromises.access as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('ENOENT')));

    await setupTlsWatcher(mockServer, tlsConfig);

    expect(logger.warn).toHaveBeenCalledWith('Cannot watch TLS directory', expect.any(Object));
    expect(fs.watch).not.toHaveBeenCalled();
  });

  describe('reloadTls', () => {
    it('should reload TLS context on change event', async () => {
      await setupTlsWatcher(mockServer, tlsConfig);

      mockWatchCallback!('change', 'cert.pem');
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(fsPromises.readFile).toHaveBeenCalledTimes(3);
      expect(mockServer.setSecureContext).toHaveBeenCalledWith({
        key: 'mock-cert-content',
        cert: 'mock-cert-content',
        ca: 'mock-cert-content',
      });
      expect(logger.info).toHaveBeenCalledWith('TLS context reloaded', {
        event: 'change',
        file: 'cert.pem',
      });
    });

    it('should ignore non-change events', async () => {
      await setupTlsWatcher(mockServer, tlsConfig);

      mockWatchCallback!('rename', 'cert.pem');
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(mockServer.setSecureContext).not.toHaveBeenCalled();
    });

    it('should log error when TLS reload fails', async () => {
      (fsPromises.readFile as jest.Mock).mockImplementation(() => Promise.reject(new Error('read failed')));

      await setupTlsWatcher(mockServer, tlsConfig);

      mockWatchCallback!('change', 'cert.pem');
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(logger.error).toHaveBeenCalledWith('Failed to reload TLS context', expect.any(Object));
    });

    it('should debounce multiple rapid change events', async () => {
      await setupTlsWatcher(mockServer, tlsConfig);

      mockWatchCallback!('change', 'key.pem');
      mockWatchCallback!('change', 'cert.pem');
      mockWatchCallback!('change', 'ca.pem');
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(fsPromises.readFile).toHaveBeenCalledTimes(3);
      expect(mockServer.setSecureContext).toHaveBeenCalledTimes(1);
    });
  });
});
