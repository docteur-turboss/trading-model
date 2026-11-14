import { intervalMsToCron } from "../../shared/scheduler/cron.util";
import type { ScheduledJob } from "./scheduler";

/** Creates a scheduled job that runs the refresh on the given interval. */
export function createRefreshJob<TClient>(
	client: TClient,
	executeFn: (client: TClient) => Promise<void>,
	refreshIntervalMs: number
): ScheduledJob {
	const schedule = intervalMsToCron(refreshIntervalMs);
	return {
		schedule,
		execute: () => executeFn(client),
	};
}
