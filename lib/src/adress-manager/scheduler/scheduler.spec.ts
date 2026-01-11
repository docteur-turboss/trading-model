import { Scheduler, ScheduledJob } from "./scheduler";
import cron from "node-cron";

jest.mock("node-cron", () => ({
  schedule: jest.fn(),
}));

describe("Scheduler", () => {
  let scheduler: Scheduler;
  let mockJob: jest.Mocked<ScheduledJob>;
  let mockTask: { start: jest.Mock; stop: jest.Mock };

  beforeEach(() => {
    scheduler = new Scheduler();

    mockJob = {
      schedule: "*/1 * * * *",
      execute: jest.fn().mockResolvedValue(undefined),
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
  test("should register a job before starting", () => {
    scheduler.register(mockJob);
    // pas d'erreur attendue
  });

  test("should throw if registering after start", () => {
    scheduler.register(mockJob);
    scheduler.start();

    const anotherJob: ScheduledJob = { schedule: "*/5 * * * *", execute: jest.fn() };
    expect(() => scheduler.register(anotherJob)).toThrow(
      "Cannot register job after scheduler has started"
    );
  });

  // -----------------------------------------------------------
  // START
  // -----------------------------------------------------------
  test("start should schedule all registered jobs", () => {
    scheduler.register(mockJob);

    scheduler.start();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledWith(
      mockJob.schedule,
      expect.any(Function)
    );
  });

  test("start should execute job function when task callback is called", async () => {
    scheduler.register(mockJob);
    scheduler.start();

    // Récupère le callback passé à cron.schedule
    const callback = (cron.schedule as jest.Mock).mock.calls[0][1];

    await callback(); // simulate cron tick
    expect(mockJob.execute).toHaveBeenCalledTimes(1);
  });

  test("start should ignore errors thrown by job.execute", async () => {
    const errorJob: ScheduledJob = {
      schedule: "*/1 * * * *",
      execute: jest.fn().mockRejectedValue(new Error("fail")),
    };
    scheduler.register(errorJob);
    scheduler.start();

    const callback = (cron.schedule as jest.Mock).mock.calls[0][1];

    await expect(callback()).resolves.toBeUndefined();
  });

  test("calling start multiple times should not reschedule jobs", () => {
    scheduler.register(mockJob);
    scheduler.start();
    scheduler.start(); // second start

    expect(cron.schedule).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------
  // STOP
  // -----------------------------------------------------------
  test("stop should call stop on all tasks and reset scheduler", () => {
    scheduler.register(mockJob);
    scheduler.start();

    scheduler.stop();

    expect(mockTask.stop).toHaveBeenCalledTimes(1);

    // Après stop, on peut redémarrer normalement
    const newJob: ScheduledJob = { schedule: "*/2 * * * *", execute: jest.fn() };
    expect(() => scheduler.register(newJob)).not.toThrow();
  });
});