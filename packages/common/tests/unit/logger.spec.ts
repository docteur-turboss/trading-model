import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Logger, LogLevel, LogEntry } from '../../src/config/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
  let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger = new Logger(LogLevel.DEBUG);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
        expect.anything(),
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
        expect.anything(),
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
        expect.anything(),
      );
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('test error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.anything(),
      );
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
});
