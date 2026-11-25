import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";

const httpGet = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get: httpGet }) },
}));
jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => {
		throw new Error("trainer down");
	},
}));

import { TrainerAdmission } from "../../src/adapters/outbound/trainer-admission";

const VERSION = "20261101T000000Z-aaaaaaaaaaaa";

/** A manifest that passes the shared schema (`ModelManifestSchema`). */
function manifest(admissible?: boolean) {
	return {
		formatVersion: 1,
		symbol: "BTCUSDT",
		version: VERSION,
		createdAt: "2026-11-01T00:00:00.000Z",
		producedBy: { instanceId: "t1" },
		weights: {
			file: "weights.f32",
			dtype: "float32-le",
			length: 1,
			sha256: "a".repeat(64),
		},
		genome: {
			id: "g",
			gaControl: {
				population: { size: 1, elitismFraction: 0, survivorFraction: 1 },
				evaluation: { episodesPerIndividual: 1 },
				selectionType: "s",
				fitnessType: "f",
			},
			network: {
				inputDim: 1,
				outputDim: 3,
				hiddenLayers: [],
				normalization: "z-score",
			},
			rl: {
				gamma: 1,
				learningRate: 1,
				discretePolicy: { epsilonStart: 1, epsilonMin: 0, epsilonDecay: 1 },
				horizon: { frameSkip: 1 },
			},
		},
		features: { dim: 1, fields: ["x"] },
		normalization: {},
		metrics: {
			generation: 1,
			fitness: 1,
			sharpe: 1,
			avgPnl: 1,
			maxDrawdown: 0,
		},
		...(admissible !== undefined && {
			admission: {
				admissible,
				evaluatedOn: "test",
				criteria: { sharpe: 1, sortino: 1, calmar: 1, buyAndHoldSharpe: 1 },
				thresholds: { minSharpe: 1, minSortino: 1, minCalmar: 1 },
			},
		}),
	};
}

function writeModel(content: unknown, weights?: Buffer): string {
	const root = mkdtempSync(join(tmpdir(), "models-"));
	const dir = join(root, "BTCUSDT", VERSION);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "manifest.json"),
		typeof content === "string" ? content : JSON.stringify(content)
	);
	if (weights) {
		writeFileSync(join(dir, "weights.f32"), weights);
	}
	return root;
}

const admission = (content: unknown) =>
	new TrainerAdmission({} as never, writeModel(content));

describe("TrainerAdmission reads the artifact store", () => {
	it("admits from the manifest with the trainer unreachable", async () => {
		await expect(
			admission(manifest(true)).admission("BTCUSDT", VERSION)
		).resolves.toMatchObject({ admissible: true });
		await expect(
			admission(manifest(false)).admission("BTCUSDT", VERSION)
		).resolves.toMatchObject({ admissible: false });
		await expect(
			admission(manifest()).admission("BTCUSDT", VERSION)
		).resolves.toMatchObject({ admissible: false });
	});

	it("rejects an unreadable manifest, so the caller fails closed", async () => {
		await expect(
			admission("{").admission("BTCUSDT", VERSION)
		).rejects.toThrow();
	});

	it("falls back to the trainer API when the store has no copy", async () => {
		await expect(
			admission(manifest(true)).admission(
				"BTCUSDT",
				"20261102T000000Z-bbbbbbbbbbbb"
			)
		).rejects.toThrow("trainer down");
	});
});
