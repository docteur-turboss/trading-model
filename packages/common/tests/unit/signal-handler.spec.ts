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

import { setupProcessHandlers, removeProcessHandlers } from '../../src/server/signal-handler';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('signal-handler', () => {
  let processOnSpy: any;
  let removeListenerSpy: any;

  beforeEach(() => {
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process as any);
    removeListenerSpy = jest
      .spyOn(process, 'removeListener')
      .mockImplementation(() => process as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    removeProcessHandlers();
  });

  it('should register SIGTERM handler', () => {
    setupProcessHandlers(jest.fn() as any, jest.fn() as any);
    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('should be idempotent when called multiple times', () => {
    setupProcessHandlers(jest.fn() as any, jest.fn() as any);
    processOnSpy.mockClear();
    removeListenerSpy.mockClear();

    setupProcessHandlers(jest.fn() as any, jest.fn() as any);

    expect(processOnSpy).not.toHaveBeenCalled();
    expect(removeListenerSpy).not.toHaveBeenCalled();
  });

  it('should register SIGINT handler', () => {
    setupProcessHandlers(jest.fn() as any, jest.fn() as any);
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('should register uncaughtException handler', () => {
    setupProcessHandlers(jest.fn() as any, jest.fn() as any);
    expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
  });

  it('should register unhandledRejection handler', () => {
    setupProcessHandlers(jest.fn() as any, jest.fn() as any);
    expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
  });

  it('should remove all handlers on cleanup', () => {
    setupProcessHandlers(jest.fn() as any, jest.fn() as any);
    removeProcessHandlers();
    expect(removeListenerSpy).toHaveBeenCalledTimes(4);
  });

  it('should call shutdown on SIGTERM via captured handler', async () => {
    const shutdown: any = jest.fn();
    setupProcessHandlers(shutdown, jest.fn() as any);

    const sigtermCall = processOnSpy.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'SIGTERM'
    );
    const handler: () => Promise<void> = (
      sigtermCall ? (sigtermCall as unknown[])[1] : undefined
    ) as any;

    expect(handler).toBeDefined();
    await handler();
    expect(shutdown).toHaveBeenCalledWith('SIGTERM');
  });

  it('should call shutdown on SIGINT via captured handler', async () => {
    const shutdown: any = jest.fn();
    setupProcessHandlers(shutdown, jest.fn() as any);

    const sigintCall = processOnSpy.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'SIGINT'
    );
    const handler: () => Promise<void> = (
      sigintCall ? (sigintCall as unknown[])[1] : undefined
    ) as any;

    expect(handler).toBeDefined();
    await handler();
    expect(shutdown).toHaveBeenCalledWith('SIGINT');
  });

  it('should call hardShutdown on uncaughtException via captured handler', () => {
    const hardShutdown = jest.fn();
    setupProcessHandlers(jest.fn() as any, hardShutdown as any);

    const uncaughtCall = processOnSpy.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'uncaughtException'
    );
    const handler: (err: Error) => void = (
      uncaughtCall ? (uncaughtCall as unknown[])[1] : undefined
    ) as any;

    expect(handler).toBeDefined();
    handler(new Error('crash'));
    expect(hardShutdown).toHaveBeenCalledWith(1);
  });

  it('should call hardShutdown on unhandledRejection via captured handler', () => {
    const hardShutdown = jest.fn();
    setupProcessHandlers(jest.fn() as any, hardShutdown as any);

    const rejectionCall = processOnSpy.mock.calls.find(
      (c: unknown[]) => (c as unknown[])[0] === 'unhandledRejection'
    );
    const handler: (reason: unknown) => void = (
      rejectionCall ? (rejectionCall as unknown[])[1] : undefined
    ) as any;

    expect(handler).toBeDefined();
    handler(new Error('rejected'));
    expect(hardShutdown).toHaveBeenCalledWith(1);
  });
});
