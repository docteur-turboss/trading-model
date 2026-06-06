import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const originalEnv = { ...process.env };

describe('env', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  const setRequiredVars = () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.TLS_KEY_PATH = '/etc/tls/key.pem';
    process.env.TLS_CERT_PATH = '/etc/tls/cert.pem';
    process.env.TLS_CA_PATH = '/etc/tls/ca.pem';
    process.env.LOG_LEVEL = 'debug';
    process.env.APP_NAME = 'financial-scraper';
    process.env.APP_VERSION = '1.0.0';
    process.env.SERVICE_NAME = 'financial-scrapper-service';
    process.env.INSTANCE_ID = 'instance-1';
    process.env.CACHE_TTL_MS = '30000';
    process.env.SERVICE_PING_TIMEOUT_MS = '2000';
    process.env.TOKEN_REFRESH_INTERVAL_MS = '60000';
    process.env.TTL_REFRESH_INTERVAL_MS = '15000';
    process.env.ADDRESS_MANAGER_URL = 'https://address-manager.example.com';
    process.env.ERROR_URL_WEBHOOK = 'https://webhook.example.com/error';
    process.env.MESSAGE_BUS_INIT_TIMEOUT_MS = '2000';
    process.env.MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS = '2000';
    process.env.MESSAGE_CALLBACK_PATH = 'message';
  };

  it('should export env with default values when optional vars missing', () => {
    setRequiredVars();
    delete process.env.LOG_LEVEL;
    delete process.env.PORT;

    const { env } = require('../../../src/config/env');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(3000);
  });

  it('should export correct values when all env vars provided', () => {
    setRequiredVars();

    const { env } = require('../../../src/config/env');
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.SERVICE_NAME).toBe('financial-scrapper-service');
    expect(env.INSTANCE_ID).toBe('instance-1');
    expect(env.APP_NAME).toBe('financial-scraper');
  });

  it('should throw on validation failure when required vars missing', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.env = {};

    expect(() => require('../../../src/config/env')).toThrow();

    consoleSpy.mockRestore();
  });

  it('should throw when APP_NAME is missing', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    setRequiredVars();
    delete process.env.APP_NAME;

    expect(() => require('../../../src/config/env')).toThrow();

    consoleSpy.mockRestore();
  });
});
