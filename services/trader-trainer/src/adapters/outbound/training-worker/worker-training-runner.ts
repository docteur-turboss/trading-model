import path from "node:path";
import { Worker, type WorkerOptions } from "node:worker_threads";
import type {
	TrainingRunner,
	TrainingSessionResult,
} from "../../../application/training-session";
import { encodeWindowSets, type WorkerMessage } from "./messages";

/**
 * Runs a training session in a worker thread so the CPU-bound GA never blocks
 * the event loop that serves the API (issue #508). The worker gets a copy of the
 * market windows and settings (same seeds, so the same result as in-process) and
 * sends back its telemetry events and the final result.
 *
 * `overrides` lets tests point at the TypeScript worker; production uses the
 * compiled file next to this one.
 */
export function createWorkerRunner(overrides?: {
	file: string;
	options?: WorkerOptions;
}): TrainingRunner {
	return (windowSets, settings, telemetry) =>
		new Promise<TrainingSessionResult>((resolve, reject) => {
			const workerData = { windowSets: encodeWindowSets(windowSets), settings };
			const worker = overrides
				? new Worker(overrides.file, { ...overrides.options, workerData })
				: new Worker(path.join(__dirname, "training-worker.js"), {
						workerData,
					});
			let settled = false;
			const settle = (fn: () => void): void => {
				if (!settled) {
					settled = true;
					fn();
				}
			};
			worker.on("message", (message: WorkerMessage) => {
				if (message.type === "telemetry") {
					const hook = telemetry?.[message.method] as
						| ((...args: unknown[]) => void)
						| undefined;
					hook?.(...message.args);
				} else if (message.type === "result") {
					settle(() => resolve(message.result as TrainingSessionResult));
				} else {
					const err = new Error(message.message);
					err.stack = message.stack ?? err.stack;
					settle(() => reject(err));
				}
			});
			worker.on("error", (err) => settle(() => reject(err)));
			worker.on("exit", (code) =>
				settle(() =>
					reject(new Error(`Training worker exited with code ${code}`))
				)
			);
		});
}

/** Production runner: compiled worker file. */
export const runInWorker: TrainingRunner = createWorkerRunner();
