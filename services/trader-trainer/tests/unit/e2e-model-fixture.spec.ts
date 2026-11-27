import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { AGENT_STATE_DIM } from "@trading-model/model-runtime/agent/agent-state";
import {
	FEATURE_DIM,
	FEATURE_LAYOUT,
} from "@trading-model/model-runtime/feature-vector-codec";
import { ModelManifestSchema } from "@trading-model/model-runtime/model-manifest";
import { FileModelArtifactStore } from "../../src/adapters/outbound/file-model-artifact-store";

/**
 * The model the compose E2E promotes (tests/e2e/risk-execution.e2e.spec.ts): fixed weights that always
 * pick `buy`, written by the trainer's own store. Its version is the constant `PROMOTED_MODELS` of
 * tests/e2e/docker-compose.e2e.yml. After a change to the manifest or the store, regenerate with
 * `UPDATE_E2E_MODEL=1 bun run --filter trader-trainer test e2e-model-fixture` and copy the new version
 * into the overlay: this spec fails until the committed files match.
 */
const FIXTURE = resolve(__dirname, "../../../../tests/e2e/fixtures/models");
const SYMBOL = "ETHUSDT";
const INPUT_DIM = FEATURE_DIM + AGENT_STATE_DIM;
const OUTPUT_DIM = 3;

function alwaysBuyWeights(): Float32Array {
	// One layer, input -> sell, hold, buy: zero weights, bias only on buy.
	const weights = new Float32Array(INPUT_DIM * OUTPUT_DIM + OUTPUT_DIM);
	weights[weights.length - 1] = 1;
	return weights;
}

async function generate(root: string): Promise<void> {
	const weights = alwaysBuyWeights();
	const store = new FileModelArtifactStore({
		root,
		retention: 1,
		now: () => new Date("2026-11-27T00:00:00.000Z"),
	});
	await store.save({
		symbol: SYMBOL,
		instanceId: "e2e-fixture",
		bestGenome: {
			id: "e2e-always-buy",
			gaControl: {
				population: { size: 1, elitismFraction: 0, survivorFraction: 1 },
				evaluation: { episodesPerIndividual: 1 },
				selectionType: "tournament",
				fitnessType: "sharpe",
			},
			network: {
				inputDim: INPUT_DIM,
				outputDim: OUTPUT_DIM,
				hiddenLayers: [],
				normalization: "none",
				actionSet: "sell_hold_buy",
			},
			rl: {
				gamma: 0.99,
				learningRate: 0.001,
				discretePolicy: { epsilonStart: 0, epsilonMin: 0, epsilonDecay: 1 },
				horizon: { frameSkip: 1 },
			},
			trainedWeights: weights,
		} as never,
		weights,
		features: FEATURE_LAYOUT,
		normalization: {},
		summary: {
			id: "e2e-always-buy",
			generation: 0,
			fitness: 0,
			sharpe: 0,
			avgPnl: 0,
			maxDrawdown: 0,
			evaluatedOn: "test",
		} as never,
		// Not measured: the E2E stub history cannot pass the ADR-0030 gate (43 200 test bars).
		admission: {
			admissible: true,
			evaluatedOn: "test",
			criteria: { sharpe: 2, sortino: 3, calmar: 2, buyAndHoldSharpe: 1 },
			thresholds: { minSharpe: 1, minSortino: 1.5, minCalmar: 1 },
		},
		window: { from: 0, testFrom: 0, to: 0 },
	});
}

async function files(root: string): Promise<Record<string, string>> {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	const out: Record<string, string> = {};
	for (const entry of entries.filter((item) => item.isFile())) {
		const path = join(entry.parentPath, entry.name);
		out[path.slice(root.length)] = (await readFile(path)).toString("base64");
	}
	return out;
}

describe("E2E promoted model fixture", () => {
	it("is what the trainer store writes today", async () => {
		const root = await mkdtemp(join(tmpdir(), "e2e-model-"));
		try {
			await generate(root);
			if (process.env.UPDATE_E2E_MODEL) {
				await rm(FIXTURE, { recursive: true, force: true });
				await cp(root, FIXTURE, { recursive: true });
			}
			expect(await files(FIXTURE)).toEqual(await files(root));
			const [version] = await readdir(join(FIXTURE, SYMBOL));
			const manifest = join(FIXTURE, SYMBOL, version, "manifest.json");
			ModelManifestSchema.parse(JSON.parse(await readFile(manifest, "utf8")));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
