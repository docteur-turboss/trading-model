import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Scheduler, ScheduledJob } from '../../src/scheduler/scheduler';
import cron from 'node-cron';

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { error: jest.fn() },
}));

import { logger } from '@trading-model/common/config/logger';
const mockLoggerError = jest.mocked(logger.error);

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockJob: jest.Mocked<ScheduledJob>;
  let mockTask: { start: jest.Mock; stop: jest.Mock };

  beforeEach(() => {
    scheduler = new Scheduler();

    mockJob = {
      schedule: '*/1 * * * *',
      execute: jest.fn().mockResolvedValue(undefined as never) as unknown as jest.MockedFunction<
        () => Promise<void>
      >,
    };

    mockTask = {
      start: jest.fn(),
      stop: jest.fn(),
    };

    (cron.schedule as jest.Mock).mockReturnValue(mockTask);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------
  // REGISTER
  // -----------------------------------------------------------
  test('should register a job before starting', () => {
    scheduler.register(mockJob);
    // no error should be thrown
  });

  test('should throw if registering after start', () => {
    scheduler.register(mockJob);
    scheduler.start();

    const anotherJob: ScheduledJob = {
      schedule: '*/5 * * * *',
      execute: jest.fn() as () => Promise<void>,
    };
    expect(() => scheduler.register(anotherJob)).toThrow(
      'Cannot register job after scheduler has started'
    );
  });

  // -----------------------------------------------------------
  // START
  // -----------------------------------------------------------
  test('start should schedule all registered jobs', () => {
    scheduler.register(mockJob);

    scheduler.start();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledWith(mockJob.schedule, expect.any(Function));
  });

  test('start should execute job function when task callback is called', async () => {
    scheduler.register(mockJob);
    scheduler.start();

    // Get the callback send to cron.schedule
    const callback = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;

    await callback(); // simulate cron tick
    expect(mockJob.execute).toHaveBeenCalledTimes(1);
  });

  test('start should log errors thrown by job.execute without propagating', async () => {
    const errorJob: ScheduledJob = {
      schedule: '*/1 * * * *',
      execute: jest
        .fn()
        .mockRejectedValue(new Error('fail') as never) as unknown as jest.MockedFunction<
        () => Promise<void>
      >,
    };
    scheduler.register(errorJob);
    scheduler.start();

    const callback = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;

    await expect(callback()).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[Scheduler] Job execution failed',
      expect.objectContaining({
        schedule: '*/1 * * * *',
        error: 'fail',
      })
    );
  });

  test('start should not log when job.execute succeeds', async () => {
    scheduler.register(mockJob);
    scheduler.start();

    const callback = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;

    await callback();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  test('calling start multiple times should not reschedule jobs', () => {
    scheduler.register(mockJob);
    scheduler.start();
    scheduler.start(); // second start

    expect(cron.schedule).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------
  // STOP
  // -----------------------------------------------------------
  test('stop should call stop on all tasks and reset scheduler', () => {
    scheduler.register(mockJob);
    scheduler.start();

    scheduler.stop();

    expect(mockTask.stop).toHaveBeenCalledTimes(1);

    // After stop, we can restart normally
    const newJob: ScheduledJob = {
      schedule: '*/2 * * * *',
      execute: jest.fn() as () => Promise<void>,
    };
    expect(() => scheduler.register(newJob)).not.toThrow();
  });
});
