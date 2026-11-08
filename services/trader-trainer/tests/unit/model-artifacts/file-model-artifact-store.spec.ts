import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { FileModelArtifactStore } from "../../../src/adapters/outbound/file-model-artifact-store";
import { FEATURE_LAYOUT } from "../../../src/domain/feature-vector-codec";
import {
	MODEL_VERSION_PATTERN,
	type NewModelArtifact,
} from "../../../src/domain/model-artifact";

const SUMMARY = {
	id: "g-1",
	generation: 7,
	fitness: 1.25,
	sharpe: 0.8,
	avgPnl: 12.5,
	maxDrawdown: 3.5,
	gaControl: {},
	network: {},
	rl: {},
} as never;

function artifact(weights: number[], symbol = "BTCUSDT"): NewModelArtifact {
	return {
		symbol,
		instanceId: "trader-trainer-1",
		bestGenome: {
			id: "g-1",
			network: { inputDim: 32, outputDim: 3 },
			rl: { gamma: 0.99 },
			trainedWeights: new Float32Array(weights),
		} as never,
		weights: new Float32Array(weights),
		features: FEATURE_LAYOUT,
		normalization: { candle: { close: { count: 3, mean: 1, m2: 0 } } },
		summary: SUMMARY,
	};
}

describe("FileModelArtifactStore", () => {
	let root: string;
	let clock: Date;
	let store: FileModelArtifactStore;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "models-"));
		clock = new Date("2026-10-29T10:15:30.123Z");
		store = new FileModelArtifactStore({
			root,
			retention: 2,
			now: () => clock,
		});
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("writes the weights as float32 little-endian and the manifest next to them", async () => {
		const summary = await store.save(artifact([0.5, -0.25, 1]));

		expect(summary.version).toMatch(MODEL_VERSION_PATTERN);
		expect(summary.version.startsWith("20261029T101530Z-")).toBe(true);
		const dir = join(root, "BTCUSDT", summary.version);
		const bytes = await readFile(join(dir, "weights.f32"));
		expect(bytes.length).toBe(12);
		expect([0, 4, 8].map((offset) => bytes.readFloatLE(offset))).toEqual([
			0.5, -0.25, 1,
		]);
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		expect(summary.sha256).toBe(sha256);
		expect(summary.version.endsWith(sha256.slice(0, 12))).toBe(true);

		const manifest = JSON.parse(
			await readFile(join(dir, "manifest.json"), "utf8")
		);
		expect(manifest).toMatchObject({
			formatVersion: 1,
			symbol: "BTCUSDT",
			createdAt: "2026-10-29T10:15:30.123Z",
			producedBy: { instanceId: "trader-trainer-1" },
			weights: { file: "weights.f32", dtype: "float32-le", length: 3, sha256 },
			genome: { id: "g-1", network: { inputDim: 32 } },
			features: { dim: 32 },
			normalization: { candle: { close: { count: 3 } } },
			metrics: { generation: 7, fitness: 1.25, sharpe: 0.8, maxDrawdown: 3.5 },
		});
		expect(manifest.genome).not.toHaveProperty("trainedWeights");
	});

	it("reads back the manifest and the weights of a version", async () => {
		const { version } = await store.save(artifact([1, 2]));

		expect((await store.manifest("BTCUSDT", version))?.version).toBe(version);
		const weights = await store.weights("BTCUSDT", version);
		expect(Buffer.from(weights as Uint8Array).readFloatLE(4)).toBe(2);
	});

	it("lists the versions newest first and keeps only the retention", async () => {
		const versions: string[] = [];
		for (const [second, weights] of [
			[1, [1]],
			[2, [2]],
			[3, [3]],
		] as const) {
			clock = new Date(`2026-10-29T10:15:0${second}.000Z`);
			versions.push((await store.save(artifact([...weights]))).version);
		}

		const listed = await store.list("BTCUSDT");

		expect(listed.map((model) => model.version)).toEqual([
			versions[2],
			versions[1],
		]);
		expect(await store.manifest("BTCUSDT", versions[0])).toBeUndefined();
	});

	it("writes a version once: the same weights in the same second are the same artifact", async () => {
		const first = await store.save(artifact([1, 2]));
		const second = await store.save(artifact([1, 2]));

		expect(second.version).toBe(first.version);
		expect(await readdir(join(root, "BTCUSDT"))).toEqual([first.version]);
	});

	it("keeps the symbols apart", async () => {
		await store.save(artifact([1], "BTCUSDT"));
		await store.save(artifact([2], "ETHUSDT"));

		expect(await store.list("BTCUSDT")).toHaveLength(1);
		expect(await store.list("ETHUSDT")).toHaveLength(1);
		expect(await store.list("SOLUSDT")).toEqual([]);
	});

	it("never resolves a path outside the root", async () => {
		await store.save(artifact([1]));

		await expect(store.save(artifact([1], "../escape"))).rejects.toThrow(
			"Invalid model symbol"
		);
		expect(await store.list("../BTCUSDT")).toEqual([]);
		expect(await store.manifest("BTCUSDT", "../../etc/passwd")).toBeUndefined();
		expect(
			await store.weights("..", "20261029T101530Z-0123456789ab")
		).toBeUndefined();
	});

	it("answers undefined for an unknown version", async () => {
		expect(
			await store.manifest("BTCUSDT", "20261029T101530Z-0123456789ab")
		).toBeUndefined();
		expect(
			await store.weights("BTCUSDT", "20261029T101530Z-0123456789ab")
		).toBeUndefined();
	});

	it("rethrows a filesystem error other than a missing path", async () => {
		// A file where the symbol directory belongs: readdir fails with ENOTDIR.
		await writeFile(join(root, "BTCUSDT"), "");
		await expect(store.list("BTCUSDT")).rejects.toMatchObject({
			code: "ENOTDIR",
		});
	});

	it("removes what a crash mid-write left once it is stale, not a write in progress", async () => {
		const symbolDir = join(root, "BTCUSDT");
		await mkdir(join(symbolDir, ".tmp-stale"), { recursive: true });
		await mkdir(join(symbolDir, ".tmp-fresh"), { recursive: true });
		const twoHoursAgo = new Date(clock.getTime() - 2 * 60 * 60 * 1000);
		await utimes(join(symbolDir, ".tmp-stale"), twoHoursAgo, twoHoursAgo);
		await utimes(join(symbolDir, ".tmp-fresh"), clock, clock);

		const { version } = await store.save(artifact([1]));

		expect((await readdir(symbolDir)).sort()).toEqual(
			[".tmp-fresh", version].sort()
		);
	});
});
