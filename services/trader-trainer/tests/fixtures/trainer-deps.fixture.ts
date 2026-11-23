import { jest } from "@jest/globals";
import { Trainer, type TrainerDeps } from "../../src/application/trainer";
import { runInProcess } from "../../src/application/training-session";
import { NoopGaTelemetry } from "../../src/domain/genetic-algorithm/ga-telemetry";
import type { MarketDataBuffer } from "../../src/domain/market-data-buffer";

const noModel = async () => undefined;

/** Trainer with inert doubles for every dependency a test does not override. */
export function makeTrainer(
	buffer: MarketDataBuffer,
	deps: Partial<TrainerDeps> & Pick<TrainerDeps, "settings">
): Trainer {
	return new Trainer(buffer, {
		publisher: { publish: jest.fn<(...a: any[]) => any>() },
		telemetry: NoopGaTelemetry,
		models: {
			save: jest.fn<(...a: any[]) => any>(),
			list: async () => [],
			latest: noModel,
			manifest: noModel,
			weights: noModel,
		},
		instanceId: "trader-trainer",
		runner: runInProcess,
		dailyCosts: () => undefined,
		...deps,
	});
}
