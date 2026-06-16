import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Logger, LogLevel } from '../../src/config/logger';

jest.mock('fs', () => ({
  appendFile: jest.fn((_path: string, _data: string, cb: (err: Error | null) => void) => cb(null)),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(() => Promise.resolve()),
}));

import { appendFile } from 'fs';
const mockAppendFile = appendFile as unknown as jest.Mock;

describe('Logger', () => {
  let logger: Logger;
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
  let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.LOG_DIR = 'log';
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger = new Logger(LogLevel.DEBUG);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.LOG_DIR;
  });

  describe('constructor', () => {
    it('should create a logger with default INFO level', () => {
      const defaultLogger = new Logger();
      defaultLogger.debug('test');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should create a logger with DEBUG level', () => {
      logger.debug('debug message');
      expect(consoleDebugSpy).toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is DEBUG', () => {
      logger.debug('test debug');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        expect.anything()
      );
    });

    it('should NOT log debug messages when level is INFO', () => {
      const infoLogger = new Logger(LogLevel.INFO);
      infoLogger.debug('should not appear');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('test info');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.anything()
      );
    });

    it('should NOT log info messages when level is WARN', () => {
      const warnLogger = new Logger(LogLevel.WARN);
      warnLogger.info('should not appear');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warn messages', () => {
      logger.warn('test warn');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.anything()
      );
    });

    it('should NOT log warn messages when level is ERROR', () => {
      const errorLogger = new Logger(LogLevel.ERROR);
      errorLogger.warn('should not appear');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('test error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.anything()
      );
    });

    it('should not log error when logLevel is above ERROR', () => {
      (logger as any).logLevel = 4;
      logger.error('should not appear');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('should return buffered log entries', () => {
      logger.info('msg1');
      logger.warn('msg2');
      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('msg1');
      expect(logs[1].message).toBe('msg2');
    });
  });

  describe('setUserId', () => {
    it('should set userId for subsequent logs', () => {
      logger.setUserId('user-123');
      logger.info('test');
      const logs = logger.getLogs();
      expect(logs[0].userId).toBe('user-123');
    });
  });

  describe('setErrorHandlerService', () => {
    it('should set the error handler service URL', () => {
      (logger as any).setErrorHandlerService('https://errors.example.com');
      expect((logger as any).handleErrorServiceUrl).toBe('https://errors.example.com');
    });
  });

  describe('error with production NODE_ENV', () => {
    it('should attempt to send error to external service in production', async () => {
      process.env.NODE_ENV = 'production';
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch' as any)
        .mockResolvedValue({ ok: true } as any);
      const prodLogger = new Logger(LogLevel.ERROR);
      prodLogger.error('prod error');
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('should handle fetch failure gracefully', async () => {
      process.env.NODE_ENV = 'production';
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch' as any)
        .mockRejectedValue(new Error('network error'));
      const prodLogger = new Logger(LogLevel.ERROR);
      expect(() => prodLogger.error('prod error')).not.toThrow();
      fetchSpy.mockRestore();
    });
  });

  describe('buffer management', () => {
    it('should limit buffer to maxLogs entries', () => {
      for (let i = 0; i < 1010; i++) {
        logger.info(`msg${i}`);
      }
      const logs = logger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('file logging', () => {
    it('should not write to file when LOG_DIR is not set', () => {
      delete process.env.LOG_DIR;
      mockAppendFile.mockClear();
      logger.info('stdout only');
      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('should write to file when LOG_DIR is set', () => {
      process.env.LOG_DIR = 'log';
      mockAppendFile.mockClear();
      logger.info('file write test');
      expect(mockAppendFile).toHaveBeenCalled();
    });
  });

  describe('createLogEntry', () => {
    it('should handle null sessionId', () => {
      (logger as any).sessionId = null;
      logger.info('test session');
      const logs = logger.getLogs();
      expect(logs[0].sessionId).toBeUndefined();
    });

    it('should log appendFile error to console.error', () => {
      mockAppendFile.mockImplementationOnce(((
        _path: string,
        _data: string,
        cb: (err: Error | null) => void
      ) => cb(new Error('disk full'))) as jest.Mock);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      logger.info('write fail test');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Logger] Failed to write log file:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('sendToErrorService with ERROR_URL_WEBHOOK', () => {
    it('should use ERROR_URL_WEBHOOK env var when set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ERROR_URL_WEBHOOK = 'https://webhook.example.com';
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch' as any)
        .mockResolvedValue({ ok: true } as any);
      const prodLogger = new Logger(LogLevel.ERROR);
      prodLogger.error('webhook test');
      expect(fetchSpy).toHaveBeenCalledWith('https://webhook.example.com', expect.anything());
      fetchSpy.mockRestore();
      delete process.env.ERROR_URL_WEBHOOK;
    });
  });

  describe('safeStringify', () => {
    it('should handle circular references gracefully', () => {
      mockAppendFile.mockClear();

      const obj: Record<string, unknown> = { name: 'parent' };
      obj.self = obj;

      logger.info('circular test', obj);

      expect(mockAppendFile).toHaveBeenCalled();
      const writtenData = mockAppendFile.mock.calls[0][1];
      expect(writtenData).toContain('[Circular]');
    });

    it('should redact sensitive keys like password, token, secret, authorization', () => {
      mockAppendFile.mockClear();

      const context = {
        password: 'supersecret',
        token: 'abc123',
        secret: 'my-secret',
        authorization: 'Bearer xyz',
        normalKey: 'visible',
      };

      logger.info('test sensitive redaction', context);

      expect(mockAppendFile).toHaveBeenCalled();
      const writtenData = mockAppendFile.mock.calls[0][1];
      expect(writtenData).toContain('"[REDACTED]"');
      expect(writtenData).not.toContain('supersecret');
      expect(writtenData).not.toContain('abc123');
      expect(writtenData).not.toContain('my-secret');
      expect(writtenData).not.toContain('Bearer xyz');
      expect(writtenData).toContain('visible');
    });

    it('should redact TLS and certificate-related keys', () => {
      mockAppendFile.mockClear();

      const context = {
        tlsKey: 'server-key-content',
        tlsCert: 'server-cert-content',
        tlsCa: 'ca-cert-content',
        certificatePath: '/certs/client.crt',
        keyCertificatePath: '/certs/client.key',
        rootCACertPath: '/certs/ca.crt',
        apiSecret: 'my-api-token',
        db_password: 'db-pass-123',
        normalField: 'visible',
      };

      logger.info('test tls redaction', context);

      expect(mockAppendFile).toHaveBeenCalled();
      const writtenData = mockAppendFile.mock.calls[0][1];
      expect(writtenData).not.toContain('server-key-content');
      expect(writtenData).not.toContain('server-cert-content');
      expect(writtenData).not.toContain('ca-cert-content');
      expect(writtenData).not.toContain('/certs/client.crt');
      expect(writtenData).not.toContain('/certs/client.key');
      expect(writtenData).not.toContain('/certs/ca.crt');
      expect(writtenData).not.toContain('my-api-token');
      expect(writtenData).not.toContain('db-pass-123');
      expect(writtenData).toContain('visible');
    });
  });

  describe('createLogEntry with metadata', () => {
    it('should include context, url, and serviceInCharge in log entry', () => {
      (logger as any).sessionId = 'sess-001';
      logger.setUserId('user-001');
      logger.info('test with meta', { key: 'val' }, 'https://example.com', 'my-service');
      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ key: 'val' });
      expect(logs[0].url).toBe('https://example.com');
      expect(logs[0].serviceInCharge).toBe('my-service');
    });
  });
});
