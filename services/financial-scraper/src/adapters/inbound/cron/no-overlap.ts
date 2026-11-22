import { runJob } from "@trading-model/http/correlation-id";
import cron from "node-cron";

export interface NoOverlapTask {
	/** Stops scheduling, aborts the run in progress, then waits for it. */
	stop(): Promise<void>;
}

/**
 * Runs `run` (as the root span `name`) on the cron `schedule` (UTC). A tick that finds the
 * previous run still in progress is skipped and reported through `onSkip`.
 * `stop()` aborts the `signal` given to `run`, which must stop starting work once it fires.
 */
export function scheduleNoOverlap(
	name: string,
	schedule: string,
	run: (signal: AbortSignal) => Promise<void>,
	onSkip: () => void
): NoOverlapTask {
	let running: Promise<void> | undefined;
	let abort: AbortController | undefined;
	const task = cron.schedule(
		schedule,
		async () => {
			if (running !== undefined) {
				onSkip();
				return;
			}
			abort = new AbortController();
			const { signal } = abort;
			running = runJob(name, () => run(signal)).finally(() => {
				running = undefined;
			});
			await running;
		},
		{ timezone: "Etc/UTC" }
	);
	return {
		async stop() {
			await task.stop();
			abort?.abort();
			await running;
		},
	};
}
