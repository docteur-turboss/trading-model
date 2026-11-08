import http from "node:http";
import path from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { createWorkerRunner } from "../../../src/adapters/outbound/training-worker/worker-training-runner";
import { Trainer } from "../../../src/application/trainer";
import { runInProcess } from "../../../src/application/training-session";
import { FitnessType } from "../../../src/domain/genetic-algorithm/genome";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import type { TrainingSettings } from "../../../src/domain/training-settings";
import { feedCandles } from "../../fixtures/market-data.fixture";

jest.mock("../../../src/config/metrics", () => {
	const metric = { set: jest.fn(), inc: jest.fn(), observe: jest.fn() };
	return new Proxy({}, { get: () => metric });
});

const SETTINGS: TrainingSettings = {
	validationSplit: 0.2,
	walkForwardFolds: 1,
	generations: 2,
	populationSize: 4,
	timeBudgetMs: 120_000,
	episodesPerIndividual: 1,
	fitnessType: FitnessType.TotalPnl,
};
const SYMBOL = TradingSymbol.of("BTCUSDT");

const workerRunner = createWorkerRunner({
	file: path.join(
		__dirname,
		"../../../src/adapters/outbound/training-worker/training-worker.ts"
	),
	options: {
		execArgv: [
			"-r",
			"ts-node/register/transpile-only",
			"-r",
			path.join(__dirname, "../../support/resolve-workspace-src.cjs"),
		],
	},
});

function makeTrainer(runner: typeof runInProcess, telemetry?: object): Trainer {
	const buffer = new MarketDataBuffer({ maxSize: 600 } as never);
	feedCandles(buffer, "BTCUSDT", 500);
	return new Trainer(buffer, {
		settings: SETTINGS,
		runner,
		telemetry: telemetry as never,
	});
}

describe("worker training runner", () => {
	it("gives the same result as in-process with a fixed seed, and relays telemetry", async () => {
		const evaluated = jest.fn();
		const inProcess = await makeTrainer(runInProcess).train(SYMBOL);
		const inWorker = await makeTrainer(workerRunner, {
			generationStarted: jest.fn(),
			stagnationUpdated: jest.fn(),
			evaluationFailed: jest.fn(),
			genomeEvaluated: evaluated,
			crossoverFallbacks: jest.fn(),
		}).train(SYMBOL);

		expect(inProcess.success).toBe(true);
		expect(inWorker.success).toBe(true);
		if (!(inProcess.success && inWorker.success)) {
			return;
		}
		expect(inWorker.bestFitness).toBe(inProcess.bestFitness);
		expect(inWorker.generation).toBe(inProcess.generation);
		expect(inWorker.bestGenome.trainedWeights).toEqual(
			inProcess.bestGenome.trainedWeights
		);
		expect(evaluated).toHaveBeenCalled();
		// Structured clone drops methods: the summary needs them (E2E regression).
		expect(inWorker.bestFitnessMeta?.pnlCurve?.sharpe()).toBe(
			inProcess.bestFitnessMeta?.pnlCurve?.sharpe()
		);
	}, 120_000);

	it("keeps serving HTTP while a session trains", async () => {
		const server = http.createServer((_req, res) => res.end("ok"));
		await new Promise<void>((r) => server.listen(0, r));
		const { port } = server.address() as { port: number };
		let worst = 0;
		let done = false;
		const probe = (async () => {
			while (!done) {
				const t = performance.now();
				await new Promise<void>((resolve, reject) =>
					http
						.get({ port }, (res) => {
							res.resume();
							res.on("end", resolve);
						})
						.on("error", reject)
				);
				worst = Math.max(worst, performance.now() - t);
				await new Promise((r) => setTimeout(r, 10));
			}
		})();
		await makeTrainer(workerRunner).train(SYMBOL);
		done = true;
		await probe;
		server.close();
		expect(worst).toBeLessThan(250);
	}, 120_000);

	it("rejects when the worker fails", async () => {
		const failing = createWorkerRunner({
			file: "data:text/javascript,throw new Error('boom')",
		});
		await expect(failing([], SETTINGS)).rejects.toThrow("boom");
	});
});
