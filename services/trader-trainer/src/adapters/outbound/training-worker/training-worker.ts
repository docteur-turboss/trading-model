import { parentPort, workerData } from "node:worker_threads";
import { runInProcess } from "../../../application/training-session";
import type { GaTelemetry } from "../../../domain/genetic-algorithm/ga-telemetry";
import type { TrainingSettings } from "../../../domain/training-settings";
import {
	decodeWindowSets,
	type TelemetryMethod,
	type WireWindowSet,
	type WorkerMessage,
} from "./messages";

/** Entry of the training worker thread: runs one session, reports to the parent. */
const port = parentPort;
if (!port) {
	throw new Error("training-worker must run in a worker thread");
}
const send = (message: WorkerMessage): void => port.postMessage(message);

const forward =
	(method: TelemetryMethod) =>
	(...args: unknown[]): void =>
		send({ type: "telemetry", method, args });

const telemetry: GaTelemetry = {
	generationStarted: forward("generationStarted"),
	stagnationUpdated: forward("stagnationUpdated"),
	evaluationFailed: forward("evaluationFailed"),
	genomeEvaluated: forward("genomeEvaluated"),
	crossoverFallbacks: forward("crossoverFallbacks"),
};

const { windowSets, settings } = workerData as {
	windowSets: WireWindowSet[];
	settings: TrainingSettings;
};

runInProcess(decodeWindowSets(windowSets), settings, telemetry).then(
	(result) => send({ type: "result", result }),
	(err: unknown) =>
		send({
			type: "error",
			message: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
		})
);
