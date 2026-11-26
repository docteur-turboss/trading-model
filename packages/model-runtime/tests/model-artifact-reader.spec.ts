import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
	MODEL_SYMBOL_PATTERN,
	readModelFile,
	readModelManifest,
} from "../src/model-artifact-reader";

const VERSION = "20261125T010203Z-0123456789ab";
let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "model-reader-"));
	await mkdir(join(root, "BTC-USDT", VERSION), { recursive: true });
	await writeFile(join(root, "BTC-USDT", VERSION, "weights.f32"), "abc");
	await writeFile(join(root, "BTC-USDT", VERSION, "manifest.json"), "{}");
	await writeFile(join(root, "weights.f32"), "outside");
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("readModelFile", () => {
	it("reads an existing file", async () => {
		const bytes = await readModelFile(root, "BTC-USDT", VERSION, "weights.f32");
		expect(bytes?.toString()).toBe("abc");
	});

	it("returns undefined on ENOENT", async () => {
		expect(await readModelFile(root, "ETH-USDT", VERSION, "weights.f32")).toBe(
			undefined
		);
	});

	it("rethrows any other error", async () => {
		// a directory read fails with EISDIR, not ENOENT
		await expect(
			readModelFile(root, "BTC-USDT", VERSION, ".")
		).rejects.toMatchObject({ code: "EISDIR" });
	});

	it("returns undefined for an invalid version", async () => {
		expect(await readModelFile(root, "BTC-USDT", "v1", "weights.f32")).toBe(
			undefined
		);
	});

	it.each(["..", "."])("refuses the symbol %p", async (symbol) => {
		expect(MODEL_SYMBOL_PATTERN.test(symbol)).toBe(false);
		expect(await readModelFile(root, symbol, VERSION, "weights.f32")).toBe(
			undefined
		);
	});

	it("accepts real symbols", () => {
		expect(MODEL_SYMBOL_PATTERN.test("BTC-USDT")).toBe(true);
		expect(MODEL_SYMBOL_PATTERN.test("BTCUSDT")).toBe(true);
	});
});

describe("readModelManifest", () => {
	it("is undefined when absent and throws when the schema fails", async () => {
		expect(await readModelManifest(root, "ETH-USDT", VERSION)).toBe(undefined);
		await expect(
			readModelManifest(root, "BTC-USDT", VERSION)
		).rejects.toThrow();
	});
});
