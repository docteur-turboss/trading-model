import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { FileEvaluationStore } from "../../src/adapters/outbound/file-evaluation-store";
import { createEvaluateModel } from "../../src/application/evaluate-model";
import {
	type ModelManifest,
	PublishedModel,
} from "../../src/domain/model-evaluation";

const WEIGHTS = new Float32Array([0.5, -1, 2]);
const BYTES = Buffer.from(WEIGHTS.buffer);
const SHA = createHash("sha256").update(BYTES).digest("hex");
const MANIFEST = {
	symbol: "BTCUSDT",
	version: "20261114T000000Z-abcdef012345",
	weights: { length: 3, sha256: SHA },
	admission: { admissible: true },
} as ModelManifest;
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

	it("records one evaluation and nothing more for a redelivery", async () => {
		const { evaluate, calls } = evaluator();
		expect(await evaluate(EVENT)).toBe("recorded");
		expect(await evaluate(EVENT)).toBe("duplicate");
		expect(calls.manifest).toBe(1);
		expect(await readdir(join(dir, "BTCUSDT"))).toEqual([
			`${MANIFEST.version}.json`,
		]);
	});

	it("keeps the admission verdict of the manifest", async () => {
		await evaluator().evaluate(EVENT);
		const file = join(dir, "BTCUSDT", `${MANIFEST.version}.json`);
		expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
			admissible: true,
			replay: "not-run",
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

	it("refuses a manifest of another version or a wrong weights length", async () => {
		const other = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			trainer: {
				manifest: async () => ({ ...MANIFEST, version: "other" }),
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});
		await expect(other(EVENT)).rejects.toThrow(/not the published/);
		const short = createEvaluateModel({
			store: new FileEvaluationStore(dir),
			trainer: {
				manifest: async () => ({
					...MANIFEST,
					weights: { length: 4, sha256: SHA },
				}),
				weights: async () => ({ bytes: BYTES, sha256: SHA }),
			},
		});
		await expect(short(EVENT)).rejects.toThrow(/float32/);
	});

	it("records a model without admission as not admissible", async () => {
		const evaluate = createEvaluateModel({
			store: new FileEvaluationStore(dir),
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

	it("never writes outside the evaluations directory", async () => {
		expect(PublishedModel.safeParse({ ...EVENT, symbol: "../x" }).success).toBe(
			false
		);
	});
});
