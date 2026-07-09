import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import type { PlatformFlagName } from "../../src/config/feature-flag-definitions";
import {
	type FeatureFlagDefinition,
	FeatureFlags,
} from "../../src/config/feature-flags";

const TEST_FLAGS: FeatureFlagDefinition[] = [
	{
		name: "ENABLE_NEW_PIPELINE" as unknown as PlatformFlagName,
		defaultEnabled: false,
		description: "Use the new data pipeline",
		owner: "@trading-model/data",
	},
	{
		name: "DISABLE_CACHE" as unknown as PlatformFlagName,
		defaultEnabled: false,
		description: "Bypass all Redis caching",
		owner: "@trading-model/platform",
	},
	{
		name: "STRICT_VALIDATION" as unknown as PlatformFlagName,
		defaultEnabled: true,
		description: "Enforce strict schema validation",
		owner: "@trading-model/core",
	},
	{
		name: "CANARY_ROUTING" as unknown as PlatformFlagName,
		defaultEnabled: false,
		description: "Route traffic to canary instances",
		owner: "@trading-model/platform",
	},
];

describe("FeatureFlags", () => {
	const originalEnv: NodeJS.ProcessEnv = {};

	beforeEach(() => {
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("FF_")) {
				originalEnv[key] = process.env[key];
				delete process.env[key];
			}
		}
	});

	afterEach(() => {
		for (const key of Object.keys(originalEnv)) {
			process.env[key] = originalEnv[key];
		}
	});

	it("should use default values when no env is set", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(false);
		expect(ff.isEnabled("STRICT_VALIDATION")).toBe(true);
	});

	it("should override defaults from environment variables", () => {
		process.env.FF_ENABLE_NEW_PIPELINE = "true";
		process.env.FF_STRICT_VALIDATION = "false";
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(true);
		expect(ff.isEnabled("STRICT_VALIDATION")).toBe(false);
	});

	it("should accept 1/0 and yes/no env values", () => {
		process.env.FF_ENABLE_NEW_PIPELINE = "1";
		process.env.FF_DISABLE_CACHE = "yes";
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(true);
		expect(ff.isEnabled("DISABLE_CACHE")).toBe(true);
	});

	it("should return false for unknown flags", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.isEnabled("NONEXISTENT_FLAG")).toBe(false);
	});

	it("should enable and disable flags at runtime", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(false);
		ff.enable("ENABLE_NEW_PIPELINE");
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(true);
		ff.disable("ENABLE_NEW_PIPELINE");
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(false);
	});

	it("should be safe to enable/disable unknown flags", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(() => ff.enable("UNKNOWN")).not.toThrow();
		expect(() => ff.disable("UNKNOWN")).not.toThrow();
	});

	it("should return all flags via getAll", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		const all = ff.getAll();
		expect(all).toHaveLength(4);
		expect(
			all.find(
				(f) => f.name === ("CANARY_ROUTING" as unknown as PlatformFlagName)
			)
		).toBeDefined();
	});

	it("should get a single flag definition", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		const flag = ff.get("STRICT_VALIDATION");
		expect(flag).toBeDefined();
		expect(flag!.name).toBe("STRICT_VALIDATION");
		expect(flag!.description).toBe("Enforce strict schema validation");
		expect(flag!.owner).toBe("@trading-model/core");
	});

	it("should return undefined for unknown flag in get", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.get("NONEXISTENT")).toBeUndefined();
	});

	it("should reset a flag to its default", () => {
		process.env.FF_ENABLE_NEW_PIPELINE = "true";
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(true);
		delete process.env.FF_ENABLE_NEW_PIPELINE;
		ff.reset("ENABLE_NEW_PIPELINE");
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(false);
	});

	it("should be safe to reset unknown flags", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(() => ff.reset("UNKNOWN")).not.toThrow();
	});

	it("should report correct size", () => {
		const ff = new FeatureFlags(TEST_FLAGS);
		expect(ff.size()).toBe(4);
	});

	it("should support custom env prefix", () => {
		process.env.MYAPP_ENABLE_NEW_PIPELINE = "true";
		const ff = new FeatureFlags(TEST_FLAGS, { envPrefix: "MYAPP_" });
		expect(ff.isEnabled("ENABLE_NEW_PIPELINE")).toBe(true);
	});
});
