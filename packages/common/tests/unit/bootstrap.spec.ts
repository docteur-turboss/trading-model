import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  _private: class {},
}));

import { createBootstrap } from '../../src/server/bootstrap';
import { removeProcessHandlers } from '../../src/server/signal-handler';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('createBootstrap', () => {
  let exitSpy: any;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    jest.spyOn(process, 'on').mockImplementation(() => process as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    removeProcessHandlers();
  });

  it('should create server and call onStart', () => {
    const mockServer = { close: jest.fn(async () => {}) };
    const createServer = jest.fn(() => mockServer);
    const onStart = jest.fn();

    const result = createBootstrap({
      name: 'test-service',
      createServer: createServer as any,
      onStart,
    });

    expect(createServer).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalled();
    expect(result.server).toBe(mockServer);
  });

  it('should return shutdown function', () => {
    const result = createBootstrap({
      name: 'test',
      createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
    });

    expect(typeof result.shutdown).toBe('function');
  });

  it('should close server and call onStop on shutdown', async () => {
    const mockServer = { close: jest.fn(async () => {}) };
    const onStop = jest.fn();

    const result = createBootstrap({
      name: 'test',
      createServer: (() => mockServer) as any,
      onStop,
    });

    await result.shutdown('SIGTERM');

    expect(mockServer.close).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should call process.exit on bootstrap error', () => {
    createBootstrap({
      name: 'test',
      createServer: (() => {
        throw new Error('boot failed');
      }) as any,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle shutdown error gracefully', async () => {
    const mockServer = {
      close: jest.fn(() => Promise.reject(new Error('close failed'))),
    };

    const result = createBootstrap({
      name: 'test',
      createServer: (() => mockServer) as any,
    });

    await result.shutdown('SIGTERM');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should call onStop via hardShutdown when shutdown fails', async () => {
    const onStop = jest.fn();
    const mockServer = {
      close: jest.fn(() => Promise.reject(new Error('close failed'))),
    };

    const result = createBootstrap({
      name: 'test',
      createServer: (() => mockServer) as any,
      onStop,
    });

    await result.shutdown('SIGTERM');

    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should not throw when onStop throws during hardShutdown', async () => {
    const onStop = jest.fn(() => {
      throw new Error('onStop failed');
    });
    const mockServer = {
      close: jest.fn(() => Promise.reject(new Error('close failed'))),
    };

    const result = createBootstrap({
      name: 'test',
      createServer: (() => mockServer) as any,
      onStop,
    });

    await result.shutdown('SIGTERM');

    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle uncaughtException', () => {
    createBootstrap({
      name: 'test',
      createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
    });
    const mockOn = process.on as unknown as jest.Mock;
    const call = mockOn.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'uncaughtException'
    );
    const handler: (err: Error) => void = (call ? (call as unknown[])[1] : undefined) as any;

    handler(new Error('crash'));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should call onStop via hardShutdown on uncaughtException', () => {
    const onStop = jest.fn();
    createBootstrap({
      name: 'test',
      createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
      onStop,
    });
    const mockOn = process.on as unknown as jest.Mock;
    const call = mockOn.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'uncaughtException'
    );
    const handler: (err: Error) => void = (call ? (call as unknown[])[1] : undefined) as any;

    handler(new Error('crash'));

    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should call onStop via hardShutdown on bootstrap error after server created', () => {
    const onStop = jest.fn();
    const mockServer = { close: jest.fn(async () => {}) };
    const createServer = jest.fn(() => mockServer);
    const onStart = jest.fn(() => {
      throw new Error('onStart failed');
    });

    createBootstrap({
      name: 'test',
      createServer: createServer as any,
      onStart,
      onStop,
    });

    expect(createServer).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle unhandledRejection', () => {
    createBootstrap({
      name: 'test',
      createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
    });
    const mockOn = process.on as unknown as jest.Mock;
    const call = mockOn.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'unhandledRejection'
    );
    const handler: (reason: unknown) => void = (call ? (call as unknown[])[1] : undefined) as any;

    handler(new Error('rejected'));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should call onStop via hardShutdown on unhandledRejection', () => {
    const onStop = jest.fn();
    createBootstrap({
      name: 'test',
      createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
      onStop,
    });
    const mockOn = process.on as unknown as jest.Mock;
    const call = mockOn.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'unhandledRejection'
    );
    const handler: (reason: unknown) => void = (call ? (call as unknown[])[1] : undefined) as any;

    handler(new Error('rejected'));

    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should not close server on shutdown when server is null', async () => {
    const result = createBootstrap({
      name: 'test',
      createServer: (() => {
        throw new Error('boot failed');
      }) as any,
    });

    await result.shutdown('SIGTERM');

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should handle shutdown without onStop when close succeeds', async () => {
    const mockServer = { close: jest.fn(async () => {}) };

    const result = createBootstrap({
      name: 'test',
      createServer: (() => mockServer) as any,
    });

    await result.shutdown('SIGTERM');

    expect(mockServer.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should exit gracefully when onStop throws during shutdown', async () => {
    const onStop = jest.fn(() => {
      throw new Error('onStop failed');
    });
    const mockServer = { close: jest.fn(async () => {}) };

    const result = createBootstrap({
      name: 'test',
      createServer: (() => mockServer) as any,
      onStop,
    });

    await result.shutdown('SIGTERM');

    expect(mockServer.close).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
