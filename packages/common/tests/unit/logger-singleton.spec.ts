import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFile: jest.fn(),
}));

const OLD_ENV = process.env.NODE_ENV;

describe('logger singleton', () => {
  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
    jest.resetModules();
  });

  it('should create DEBUG level logger in development', () => {
    process.env.NODE_ENV = 'development';
    jest.isolateModules(() => {
      const { logger: devLogger, LogLevel } = require('../../src/config/logger');
      expect((devLogger as any).logLevel).toBe(LogLevel.DEBUG);
    });
  });

  it('should create INFO level logger in staging', () => {
    process.env.NODE_ENV = 'staging';
    jest.isolateModules(() => {
      const { logger: stagingLogger, LogLevel } = require('../../src/config/logger');
      expect((stagingLogger as any).logLevel).toBe(LogLevel.INFO);
    });
  });

  it('should create WARN level logger in production', () => {
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => {
      const { logger: prodLogger, LogLevel } = require('../../src/config/logger');
      expect((prodLogger as any).logLevel).toBe(LogLevel.WARN);
    });
  });

  it('should create WARN level logger when NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;
    jest.isolateModules(() => {
      const { logger: defaultLogger, LogLevel } = require('../../src/config/logger');
      expect((defaultLogger as any).logLevel).toBe(LogLevel.WARN);
    });
  });
});
