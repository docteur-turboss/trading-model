import { intervalMsToCron } from "../../shared/scheduler/cron.util";
import type { ScheduledJob } from "./scheduler";

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
