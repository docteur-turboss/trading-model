import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrainerAdmission } from "../../services/risk-execution/src/adapters/outbound/trainer-admission";
import { FileModelArtifactStore } from "../../services/trader-trainer/src/adapters/outbound/file-model-artifact-store";
import { NETWORK_INPUT_LAYOUT } from "../../services/trader-trainer/src/domain/agent/agent-state";
import { createDefaultGenome } from "../../services/trader-trainer/src/domain/genetic-algorithm/factory";
import {
	ADMISSION_THRESHOLDS,
	type ModelAdmission,
} from "../../services/trader-trainer/src/domain/model-admission";

/**
 * Admission contract: trader-trainer's `FileModelArtifactStore` writes the
 * manifest, risk-execution's `TrainerAdmission` reads `admission.admissible`
 * from the same artifact directory. Only mTLS and discovery are replaced; the
 * store hit comes before any HTTP call.
 */
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({}) },
}));
jest.mock("../../services/risk-execution/src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
}));

const admission = (admissible: boolean): ModelAdmission => ({
	admissible,
	evaluatedOn: "test",
	criteria: { sharpe: 1, sortino: 2, calmar: 1, buyAndHoldSharpe: 0 },
	thresholds: ADMISSION_THRESHOLDS,
});

describe("admission contract: trader-trainer → risk-execution", () => {
	let root: string;
	let store: FileModelArtifactStore;
	let reader: TrainerAdmission;
	let tick = 0;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "admission-"));
		store = new FileModelArtifactStore({
			root,
			retention: 5,
			now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
		});
		reader = new TrainerAdmission({} as never, root);
	});

	afterAll(() => rm(root, { recursive: true, force: true }));

	const save = async (verdict?: ModelAdmission) => {
		const genome = createDefaultGenome("contract");
		const { version } = await store.save({
			symbol: "BTCUSDT",
			instanceId: "trader-trainer-1",
			bestGenome: genome,
			weights: new Float32Array([tick, 1]),
			features: NETWORK_INPUT_LAYOUT,
			normalization: {},
			summary: {
				id: genome.id,
				generation: 1,
				fitness: 1,
				sharpe: 1,
				avgPnl: 1,
				maxDrawdown: 1,
				evaluatedOn: "test",
			} as never,
			admission: verdict,
		});
		return (await reader.admission("BTCUSDT", version)).admissible;
	};

	it.each([
		["admissible", admission(true), true],
		["not admissible", admission(false), false],
		["without admission", undefined, false],
	])("manifest %s → %s", async (_name, verdict, expected) => {
		expect(await save(verdict)).toBe(expected);
	});
});
