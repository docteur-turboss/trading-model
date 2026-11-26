import { describe, expect, it } from "@jest/globals";
import * as primitives from "../../../src/primitives/index";

describe("domain/primitives/index", () => {
	const runtimeExports = [
		"Cash",
		"DataSource",
		"DecimalPrecision",
		"FilePath",
		"Fitness",
		"Hostname",
		"IPAddress",
		"Limit",
		"NonNegativeInt",
		"PageNumber",
		"Percentage",
		"Port",
		"PositiveInt",
		"Price",
		"Probability",
		"Ratio",
		"Reward",
		"SharpeRatio",
		"TradingSymbol",
		"UnixTimestamp",
		"URLString",
		"Volume",
		"CaPem",
		"CertPem",
		"ClientIdentity",
		"CorrelationId",
		"DbName",
		"DbPassword",
		"DbUser",
		"DurationMs",
		"GenomeId",
		"InstanceId",
		"KeyPem",
		"MessageId",
		"MessagePriority",
		"Region",
		"Role",
		"SequenceNumber",
		"ServiceId",
		"Subject",
		"TenantId",
		"Topic",
		"Version",
	];

	for (const name of runtimeExports) {
		it(`should export ${name}`, () => {
			expect((primitives as Record<string, unknown>)[name]).toBeDefined();
		});
	}
});
