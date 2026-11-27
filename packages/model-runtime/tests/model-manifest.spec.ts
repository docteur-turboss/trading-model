import { createHash } from "node:crypto";
import { describe, expect, test } from "@jest/globals";
import {
	isSupportedInterval,
	MINUTE_MS,
	type ModelManifest,
	verifyModel,
} from "../src/model-manifest";

const weights = new Uint8Array(8);
const sha256 = createHash("sha256").update(weights).digest("hex");
const manifest = {
	symbol: "BTCUSDT",
	version: "v1",
	weights: { file: "weights.f32", dtype: "float32-le", length: 2, sha256 },
} as ModelManifest;
const model = { symbol: "BTCUSDT", version: "v1" };
const verify = (over: Partial<Parameters<typeof verifyModel>[0]> = {}) =>
	verifyModel({ model, manifest, weights, headerSha256: sha256, ...over });

describe("verifyModel", () => {
	test("accepts matching weights", () => {
		expect(() => verify({ model: { ...model, sha256 } })).not.toThrow();
	});

	test.each([
		[
			"another model",
			{ model: { ...model, version: "v2" } },
			"is not the expected",
		],
		["a wrong header", { headerSha256: "x" }, "refused"],
		["a wrong event sha256", { model: { ...model, sha256: "x" } }, "refused"],
		[
			"tampered weights",
			{ weights: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]) },
			"refused",
		],
		[
			"a wrong length",
			{
				manifest: { ...manifest, weights: { ...manifest.weights, length: 3 } },
			},
			"refused",
		],
	])("refuses %s", (_name, over, message) => {
		expect(() => verify(over)).toThrow(message);
	});
});

test("isSupportedInterval accepts minute and day only", () => {
	expect(isSupportedInterval(MINUTE_MS)).toBe(true);
	expect(isSupportedInterval(86_400_000)).toBe(true);
	expect(isSupportedInterval(5)).toBe(false);
});
