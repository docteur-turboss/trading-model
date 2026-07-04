import { intervalMsToCron } from "./cron.util";
import type { ScheduledJob } from "./scheduler";

/**
 * Parameterized scheduled job that periodically executes a refresh function
 * against a client instance.
 *
 * Replaces previously duplicated TokenRefresherJob and TtlRefresherJob.
 *
 * @template TClient - Client type used by the refresh function.
 */
export class RefreshJob<TClient> implements ScheduledJob {
	/**
	 * Cron expression representing the refresh schedule.
	 */
	public readonly schedule: string;

	private readonly _client: TClient;

	private readonly _executeFn: (client: TClient) => Promise<void>;

	/**
	 * Creates a new RefreshJob.
	 */
	constructor(
		client: TClient,
		executeFn: (client: TClient) => Promise<void>,
		refreshIntervalMs: number
	) {
		this._client = client;
		this._executeFn = executeFn;
		this.schedule = intervalMsToCron(refreshIntervalMs);
	}

	/**
	 * Executes the registered refresh function.
	 *
	 * Called by the scheduler at the interval defined by `schedule`.
	 */
	async execute(): Promise<void> {
		await this._executeFn(this._client);
	}
}
