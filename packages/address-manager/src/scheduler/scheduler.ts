import { logger } from "@trading-model/common/config/logger";
import cron, { type ScheduledTask } from "node-cron";

/**
 * Minimal contract that a scheduled job must implement.
 * The Scheduler only knows this contract and interacts through it.
 */
export interface ScheduledJob {
	/**
	 * Cron expression or interval compatible with node-cron.
	 */
	readonly schedule: string;

	/**
	 * Executed on every tick of the cron schedule.
	 */
	execute(): Promise<void>;
}

/**
 * Scheduler
 *
 * Responsibilities:
 * - Register scheduled jobs
 * - Start and stop their execution cleanly
 *
 * Constraints:
 * - No business logic
 * - No access to caching or service discovery
 * - Does not know the content or behavior of the jobs
 *
 * This scheduler is a simple orchestrator that delegates execution to registered jobs.
 * Each job is responsible for its own error handling and robustness.
 */
export class Scheduler {
	private readonly _tasks: ScheduledTask[] = [];
	private readonly _jobs: ScheduledJob[] = [];
	private _started = false;

	/**
	 * Registers a scheduled job.
	 *
	 * @param job - Job to register
	 * @throws Error if the scheduler has already been started
	 */
	register(job: ScheduledJob): void {
		if (this._started) {
			throw new Error("Cannot register job after scheduler has started");
		}

		this._jobs.push(job);
	}

	/**
	 * Starts all registered jobs.
	 */
	private _createTask(job: ScheduledJob): cron.ScheduledTask {
		return cron.schedule(job.schedule, async () => {
			try {
				await job.execute();
			} catch (err) {
				logger.error("Job execution failed", {
					schedule: job.schedule,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		});
	}

	start(): void {
		if (this._started) {
			return;
		}
		for (const job of this._jobs) {
			this._tasks.push(this._createTask(job));
		}
		this._started = true;
	}

	/**
	 * Stops all scheduled jobs gracefully.
	 */
	stop(): void {
		for (const task of this._tasks) {
			task.stop();
		}

		this._tasks.length = 0;
		this._started = false;
	}
}
