import { afterEach, describe, expect, it } from "@jest/globals";
import { PlatformFlagName } from "../../../src/config/feature-flag-definitions";
import {
	getGlobalFeatureFlags,
	resetGlobalFeatureFlags,
} from "../../../src/config/global-feature-flags";

describe("globalFeatureFlags", () => {
	afterEach(() => {
		resetGlobalFeatureFlags();
	});

	it("should return a FeatureFlags instance", () => {
		const flags = getGlobalFeatureFlags();
		expect(flags).toBeDefined();
		expect(flags.isEnabled(PlatformFlagName.DLQ_AUTO_RETRY)).toBe(true);
		expect(flags.isEnabled(PlatformFlagName.CANARY_MIGRATIONS)).toBe(false);
	});

	it("should return the same singleton on repeated calls", () => {
		const a = getGlobalFeatureFlags();
		const b = getGlobalFeatureFlags();
		expect(a).toBe(b);
	});

	it("should return a new instance after reset", () => {
		const a = getGlobalFeatureFlags();
		resetGlobalFeatureFlags();
		const b = getGlobalFeatureFlags();
		expect(a).not.toBe(b);
	});

	it("should return the correct default for each platform flag", () => {
		resetGlobalFeatureFlags();
		const flags = getGlobalFeatureFlags();
		expect(flags.isEnabled(PlatformFlagName.DLQ_AUTO_RETRY)).toBe(true);
		expect(flags.isEnabled(PlatformFlagName.CANARY_MIGRATIONS)).toBe(false);
		expect(flags.isEnabled(PlatformFlagName.STRICT_CIRCUIT_BREAKER)).toBe(true);
		expect(flags.isEnabled(PlatformFlagName.MESSAGE_DEDUPLICATION)).toBe(true);
		expect(flags.isEnabled(PlatformFlagName.GRACEFUL_SHUTDOWN_DRAIN)).toBe(
			true
		);
		expect(flags.isEnabled(PlatformFlagName.ENABLE_REQUEST_LOGGING)).toBe(true);
		expect(flags.isEnabled(PlatformFlagName.ENABLE_METRICS_EXPORT)).toBe(true);
		expect(
			flags.isEnabled(PlatformFlagName.ENABLE_DETAILED_ERROR_RESPONSE)
		).toBe(false);
		expect(flags.isEnabled(PlatformFlagName.ENABLE_CACHE_BYPASS)).toBe(false);
		expect(flags.isEnabled(PlatformFlagName.WAL_SYNCHRONOUS_FLUSH)).toBe(false);
		expect(flags.isEnabled(PlatformFlagName.ENABLE_TELEMETRY_DETAILED)).toBe(
			true
		);
		expect(flags.isEnabled(PlatformFlagName.ENFORCE_MTLS_STRICT)).toBe(true);
	});

	it("should have the correct size", () => {
		const flags = getGlobalFeatureFlags();
		expect(flags.size()).toBe(12);
	});
});
