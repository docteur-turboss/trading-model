import { runJob } from "@trading-model/http/correlation-id";
import cron from "node-cron";

export interface NoOverlapTask {
	/** Stops scheduling, then waits for the run in progress. */
	stop(): Promise<void>;
}

/**
 * Runs `run` (as the root span `name`) on the cron `schedule` (UTC). A tick that finds the previous run
 * still in progress is skipped and reported through `onSkip`.
 */
export function scheduleNoOverlap(
	name: string,
	schedule: string,
	run: () => Promise<void>,
	onSkip: () => void
): NoOverlapTask {
	let running: Promise<void> | undefined;
	const task = cron.schedule(
		schedule,
		async () => {
			if (running !== undefined) {
				onSkip();
				return;
			}
			running = runJob(name, run).finally(() => {
				running = undefined;
			});
			await running;
		},
		{ timezone: "Etc/UTC" }
	);
	return {
		async stop() {
			await task.stop();
			await running;
		},
	};
}
