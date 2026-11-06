import { z } from "zod";
import { featureFlag } from "../src/config/feature-flags";

const schema = z.object({ FEATURE_X: featureFlag(true) });

describe("featureFlag", () => {
	it("uses the default when unset", () => {
		expect(schema.parse({}).FEATURE_X).toBe(true);
		expect(z.object({ F: featureFlag(false) }).parse({}).F).toBe(false);
	});

	it.each([
		["false", false],
		["0", false],
		["true", true],
		["1", true],
	])("parses %s", (raw, expected) => {
		expect(schema.parse({ FEATURE_X: raw }).FEATURE_X).toBe(expected);
	});

	it("refuses an invalid value", () => {
		expect(() => schema.parse({ FEATURE_X: "maybe" })).toThrow();
	});
});
