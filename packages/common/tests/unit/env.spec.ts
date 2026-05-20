import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { validateEnv, BaseEnvSchema } from '../../src/validation/env';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('validateEnv', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...OLD_ENV };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('should return parsed env when valid', () => {
    process.env.NODE_ENV = 'production';
    process.env.TLS_KEY_PATH = '/some/key';
    process.env.TLS_CERT_PATH = '/some/cert';
    process.env.TLS_CA_PATH = '/some/ca';

    const result = validateEnv(BaseEnvSchema);
    expect(result.NODE_ENV).toBe('production');
    expect(result.TLS_KEY_PATH).toBe('/some/key');
    expect(result.TLS_CERT_PATH).toBe('/some/cert');
    expect(result.TLS_CA_PATH).toBe('/some/ca');
  });

  it('should exit process on invalid env', () => {
    delete process.env.NODE_ENV;
    delete process.env.TLS_KEY_PATH;
    delete process.env.TLS_CERT_PATH;
    delete process.env.TLS_CA_PATH;

    validateEnv(BaseEnvSchema);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should apply default values', () => {
    delete process.env.NODE_ENV;
    process.env.TLS_KEY_PATH = '/key';
    process.env.TLS_CERT_PATH = '/cert';
    process.env.TLS_CA_PATH = '/ca';

    const result = validateEnv(BaseEnvSchema);
    expect(result.PORT).toBe(3000);
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.NODE_ENV).toBe('development');
  });

  it('should coerce PORT to number', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '4000';
    process.env.TLS_KEY_PATH = '/key';
    process.env.TLS_CERT_PATH = '/cert';
    process.env.TLS_CA_PATH = '/ca';

    const result = validateEnv(BaseEnvSchema);
    expect(result.PORT).toBe(4000);
  });

  it('should handle invalid env when treeifyError is unavailable', () => {
    jest.isolateModules(() => {
      jest.doMock('zod', () => {
        const actual: Record<string, unknown> = jest.requireActual('zod');
        delete actual.treeifyError;
        return actual;
      });

      const {
        validateEnv: validate2,
        BaseEnvSchema: BaseSchema2,
      } = require('../../src/validation/env');

      delete process.env.NODE_ENV;
      delete process.env.TLS_KEY_PATH;
      delete process.env.TLS_CERT_PATH;
      delete process.env.TLS_CA_PATH;

      validate2(BaseSchema2);
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  it('should handle treeifyError throwing an exception', () => {
    const zod = jest.requireActual('zod') as any;
    jest.spyOn(zod.z, 'treeifyError').mockImplementation(() => {
      throw new Error('treeify failed');
    });

    delete process.env.NODE_ENV;
    delete process.env.TLS_KEY_PATH;
    delete process.env.TLS_CERT_PATH;
    delete process.env.TLS_CA_PATH;

    validateEnv(BaseEnvSchema);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should handle invalid env when treeifyError is not a function', () => {
    const zod = jest.requireActual('zod') as any;
    const origTreeifyError = zod.z.treeifyError;
    delete zod.z.treeifyError;

    delete process.env.NODE_ENV;
    delete process.env.TLS_KEY_PATH;
    delete process.env.TLS_CERT_PATH;
    delete process.env.TLS_CA_PATH;

    validateEnv(BaseEnvSchema);
    expect(process.exit).toHaveBeenCalledWith(1);

    zod.z.treeifyError = origTreeifyError;
  });
});
