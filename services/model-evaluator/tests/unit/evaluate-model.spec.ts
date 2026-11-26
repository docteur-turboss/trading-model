import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { DAY_MS } from "@trading-model/model-runtime/features/feature-builder";
import { ModelManifest } from "@trading-model/model-runtime/model-manifest";
import { replayModel } from "@trading-model/model-runtime/replay";
import { FileEvaluationStore } from "../../src/adapters/outbound/file-evaluation-store";
import { createEvaluateModel } from "../../src/application/evaluate-model";
import { MODEL_REPLAY_SHARPE_GAP } from "../../src/config/metrics";
import { PublishedModel } from "../../src/domain/model-evaluation";

const WEIGHTS = new Float32Array([0.5, -1, 2]);
const BYTES = Buffer.from(WEIGHTS.buffer);
const SHA = createHash("sha256").update(BYTES).digest("hex");
const GENOME = {
	id: "g-1",
	gaControl: {
		population: { size: 10, elitismFraction: 0.1, survivorFraction: 0.5 },
		evaluation: { episodesPerIndividual: 1 },
		selectionType: "tournament",
		fitnessType: "sharpe",
	},
	network: {
		inputDim: 4,
		outputDim: 3,
		hiddenLayers: [{ neurons: 8, activation: "relu" }],
		normalization: "min-max",
	},
	rl: {
		gamma: 0.9,
		learningRate: 0.001,
		discretePolicy: { epsilonStart: 1, epsilonMin: 0.05, epsilonDecay: 0.99 },
		horizon: { frameSkip: 1 },
	},
};
const MANIFEST = {
	symbol: "BTCUSDT",
	version: "20261114T000000Z-abcdef012345",
	weights: {
		file: "weights.f32",
		dtype: "float32-le",
		length: 3,
		sha256: SHA,
	},
	genome: GENOME,
	admission: {
		admissible: true,
		evaluatedOn: "test",
		criteria: { sharpe: 1, sortino: 1, calmar: 1, buyAndHoldSharpe: 0 },
		thresholds: { minSharpe: 0, minSortino: 0, minCalmar: 0 },
	},
} as ModelManifest;
const NO_CANDLES = { candles: async () => [] };
/** Two one-minute candles, the second one the test segment. */
const WINDOW = {
	from: 0,
	testFrom: 60_000,
	to: 119_999,
	intervalMs: 60_000,
	evalEpsilon: 0.05,
	simulator: {
		initialCash: 1000,
		feeRate: 0.001,
		executionCostRate: 0.0005,
		tradeFraction: 0.1,
		observePosition: true,
	},
};

jest.mock("@trading-model/model-runtime/replay", () => ({
	replayModel: jest.fn(() => ({
		sharpe: 3,
		sortino: 4,
		calmar: 5,
		buyAndHoldSharpe: 1,
	})),
}));
const EVENT = { symbol: "BTCUSDT", version: MANIFEST.version, sha256: SHA };

describe("evaluate a published model", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "evaluations-"));
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	const evaluator = (bytes = BYTES, header: string | undefined = SHA) => {
		const calls = { manifest: 0 };
		const evaluate = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			scraper: NO_CANDLES,
			trainer: {
				manifest: async () => {
					calls.manifest++;
					return MANIFEST;
				},
				weights: async () => ({ bytes, sha256: header }),
			},
		});
		return { evaluate, calls };
	};

	it("hands the bus abort signal to the manifest, the weights and the candles", async () => {
		const seen: (AbortSignal | undefined)[] = [];
		const evaluate = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			scraper: {
				candles: async (_s, _f, _t, _i, signal) => {
					seen.push(signal);
					return [];
				},
			},
			trainer: {
				manifest: async (_s, _v, signal) => {
					seen.push(signal);
					return { ...MANIFEST, replay: WINDOW } as ModelManifest;
				},
				weights: async (_s, _v, signal) => {
					seen.push(signal);
					return { bytes: BYTES, sha256: SHA };
				},
			},
		});
		const bus = new AbortController();
		await evaluate(EVENT as PublishedModel, bus.signal);
		bus.abort();

		expect(seen).toHaveLength(3);
		expect(seen.every((s) => s?.aborted)).toBe(true);
	});

	it("fails at the global budget on a scraper that never answers, recording nothing", async () => {
		const timeout = jest
			.spyOn(AbortSignal, "timeout")
			.mockImplementation(() => {
				const budget = new AbortController();
				setTimeout(() => budget.abort(new Error("budget")), 20);
				return budget.signal;
			});
		const store = new FileEvaluationStore(dir);
		const create = jest.spyOn(store, "create");
		const evaluate = createEvaluateModel({
			store,
			scraper: {
				candles: (_s, _f, _t, _i, signal) =>
					new Promise((_, reject) => {
						// On a slow runner the 20 ms budget can expire before this call.
						if (signal?.aborted) {
							reject(signal.reason);
							return;
						}
						signal?.addEventListener("abort", () => reject(signal.reason));
					}),
			},
			trainer: {
				manifest: async () =>
					({ ...MANIFEST, replay: WINDOW }) as ModelManifest,
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});

		await expect(evaluate(EVENT as PublishedModel)).rejects.toThrow("budget");
		timeout.mockRestore();
		expect(create).not.toHaveBeenCalled();
	});

	it("reads a manifest from before and one from after the signal inputs (ADR-0081)", () => {
		const base = { ...MANIFEST, features: { dim: 19, fields: ["Bias"] } };
		const withSignals = {
			...base,
			features: {
				dim: 22,
				fields: ["Bias", "SignalValue:BTC:social:pageviews"],
			},
			normalization: {
				signals: { "BTC:social:pageviews": { mean: 1, std: 2 } },
			},
		};

		expect(ModelManifest.safeParse(base).success).toBe(true);
		expect(ModelManifest.safeParse(withSignals).success).toBe(true);
		const components = [
			{ role: "trunk", id: "trunk:ab", version: "ab", sha256: "ab" },
		];
		expect(ModelManifest.safeParse({ ...base, components }).success).toBe(true);
	});

	it("records the model of a daily asset: replay with a one-day bar and its own costs", async () => {
		const daily = {
			...MANIFEST,
			symbol: "AAPL",
			replay: { ...WINDOW, intervalMs: 86_400_000 },
		};
		expect(ModelManifest.safeParse(daily).success).toBe(true);
		const evaluate = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			scraper: NO_CANDLES,
			trainer: {
				manifest: async () => daily as ModelManifest,
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});
		expect(await evaluate({ ...EVENT, symbol: "AAPL" })).toBe("recorded");
	});

	it("records one evaluation and nothing more for a redelivery", async () => {
		const { evaluate, calls } = evaluator();
		expect(await evaluate(EVENT)).toBe("recorded");
		expect(await evaluate(EVENT)).toBe("duplicate");
		expect(calls.manifest).toBe(1);
		expect(await readdir(join(dir, "BTCUSDT"))).toEqual([
			`${MANIFEST.version}.json`,
		]);
	});

	it("keeps the admission verdict; a manifest without window is not replayed", async () => {
		await evaluator().evaluate(EVENT);
		const file = join(dir, "BTCUSDT", `${MANIFEST.version}.json`);
		expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
			admissible: true,
			replay: "failed",
			reason: "no-window",
		});
	});

	describe("replay on the manifest window (ADR-0079)", () => {
		const candle = (minute: number) =>
			({
				timestamp: minute * 60_000,
				closeTimestamp: minute * 60_000 + 59_999,
			}) as CandleData;
		const record = async (
			candles: () => Promise<CandleData[]>,
			replay: object = WINDOW
		) => {
			const manifest = {
				...MANIFEST,
				replay,
			} as ModelManifest;
			await createEvaluateModel({
				store: new FileEvaluationStore(dir),
				scraper: { candles },
				trainer: {
					manifest: async () => manifest,
					weights: async () => ({ bytes: BYTES, sha256: SHA }),
				},
			})(EVENT);
			const file = join(dir, "BTCUSDT", `${MANIFEST.version}.json`);
			const body = JSON.parse(await readFile(file, "utf8"));
			await rm(join(dir, "BTCUSDT"), { recursive: true });
			return body;
		};

		it("replays on the candles from `from` to `to`, never later, and records the ratios and the gap", async () => {
			const read = jest.fn(async (..._args: unknown[]) =>
				[0, 1, 2].map(candle)
			);
			expect(await record(read)).toMatchObject({
				replay: "done",
				metrics: { policy: "greedy", sharpe: 3, sortino: 4 },
			});
			expect(read).toHaveBeenCalledWith(
				"BTCUSDT",
				0,
				119_999,
				60_000,
				expect.any(AbortSignal)
			);
			expect(jest.mocked(replayModel).mock.calls[0][0]).toMatchObject({
				candles: [candle(0), candle(1)],
				testFrom: 60_000,
				weights: WEIGHTS,
			});
			expect((await MODEL_REPLAY_SHARPE_GAP.get()).values[0]).toMatchObject({
				labels: { symbol: "BTCUSDT" },
				value: 2,
			});
		});

		it("records why a replay failed: missing candles, replay error", async () => {
			expect(await record(async () => [candle(1)])).toMatchObject({
				replay: "failed",
				reason: "missing-candles",
			});
			jest.mocked(replayModel).mockImplementationOnce(() => {
				throw new Error("Expected input size 19, got 22");
			});
			expect(await record(async () => [0, 1].map(candle))).toMatchObject({
				replay: "failed",
				reason: "replay-error: Expected input size 19, got 22",
			});
		});

		it("replays a daily model on the daily bars of its interval, and refuses an unknown interval with its reason", async () => {
			const day = (index: number) =>
				({
					timestamp: index * DAY_MS,
					closeTimestamp: (index + 1) * DAY_MS - 1,
				}) as CandleData;
			const read = jest.fn(async (..._args: unknown[]) => [0, 1].map(day));
			const daily = { ...WINDOW, to: 2 * DAY_MS - 1, intervalMs: DAY_MS };
			expect(await record(read, daily)).toMatchObject({ replay: "done" });
			expect(read).toHaveBeenCalledWith(
				"BTCUSDT",
				0,
				2 * DAY_MS - 1,
				DAY_MS,
				expect.any(AbortSignal)
			);
			expect(
				await record(read, { ...WINDOW, intervalMs: 3_600_000 })
			).toMatchObject({
				replay: "failed",
				reason: "unsupported-interval: 3600000 ms",
			});
		});

		it("records nothing on a read error, then `done` on the redelivery", async () => {
			await expect(
				record(async () => {
					throw new Error("scraper down");
				})
			).rejects.toThrow("scraper down");
			await expect(readdir(dir)).resolves.toEqual([]);
			expect(await record(async () => [0, 1].map(candle))).toMatchObject({
				replay: "done",
			});
		});
	});

	it("refuses weights whose sha256 differs from the manifest, and records nothing", async () => {
		const tampered = Buffer.from(new Float32Array([9, 9, 9]).buffer);
		await expect(evaluator(tampered, SHA).evaluate(EVENT)).rejects.toThrow(
			/refused/
		);
		await expect(
			evaluator(BYTES, "0".repeat(64)).evaluate(EVENT)
		).rejects.toThrow(/refused/);
		await expect(readdir(dir)).resolves.toEqual([]);
	});

	it("rejects a manifest whose genome cannot be replayed", () => {
		expect(ModelManifest.safeParse(MANIFEST).success).toBe(true);
		const bad = { ...MANIFEST, genome: { ...GENOME, network: {} } };
		expect(ModelManifest.safeParse(bad).success).toBe(false);
	});

	it("refuses a manifest of another version or a wrong weights length", async () => {
		const other = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			scraper: NO_CANDLES,
			trainer: {
				manifest: async () => ({ ...MANIFEST, version: "other" }),
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});
		await expect(other(EVENT)).rejects.toThrow(/not the expected/);
		const short = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			scraper: NO_CANDLES,
			trainer: {
				manifest: async () => ({
					...MANIFEST,
					weights: { ...MANIFEST.weights, length: 4 },
				}),
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});
		await expect(short(EVENT)).rejects.toThrow(/float32/);
	});

	it("records a model without admission as not admissible", async () => {
		const evaluate = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			scraper: NO_CANDLES,
			trainer: {
				manifest: async () => ({ ...MANIFEST, admission: undefined }),
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});
		await evaluate(EVENT);
		const file = join(dir, "BTCUSDT", `${MANIFEST.version}.json`);
		expect(JSON.parse(await readFile(file, "utf8")).admissible).toBe(false);
	});

	it("does not hide a store failure as a missing record", async () => {
		await writeFile(join(dir, "file"), "x");
		const store = new FileEvaluationStore(join(dir, "file"));
		const invalid = new FileEvaluationStore(`${dir}\u0000`);
		await expect(invalid.has("BTCUSDT", "v1")).rejects.toThrow();
		await expect(
			store.create({ symbol: "BTCUSDT" } as never)
		).rejects.toThrow();
	});

	it("publishes no final file when the sync fails", async () => {
		const fsp =
			jest.requireActual<typeof import("node:fs/promises")>("node:fs/promises");
		const open = fsp.open;
		jest.spyOn(fsp, "open").mockImplementationOnce((async (...a: any[]) => {
			const handle = await (open as any)(...a);
			handle.sync = async () => {
				throw new Error("EIO");
			};
			return handle;
		}) as never);
		await expect(
			new FileEvaluationStore(dir).create({
				symbol: "BTCUSDT",
				version: "v1",
			} as never)
		).rejects.toThrow("EIO");
		expect(await readdir(join(dir, "BTCUSDT"))).toEqual([]);
		jest.restoreAllMocks();
	});

	it("creates once under concurrency and ignores orphan temporaries", async () => {
		const store = new FileEvaluationStore(dir);
		const record = { symbol: "BTCUSDT", version: "v1" } as never;
		await mkdir(join(dir, "BTCUSDT"));
		await writeFile(join(dir, "BTCUSDT", ".tmp-orphan"), "{");
		expect(await store.has("BTCUSDT", "v1")).toBe(false);
		const results = await Promise.all([
			store.create(record),
			store.create(record),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(await readdir(join(dir, "BTCUSDT"))).toEqual([
			".tmp-orphan",
			"v1.json",
		]);
	});

	it("never writes outside the evaluations directory", async () => {
		expect(PublishedModel.safeParse({ ...EVENT, symbol: "../x" }).success).toBe(
			false
		);
	});
});
