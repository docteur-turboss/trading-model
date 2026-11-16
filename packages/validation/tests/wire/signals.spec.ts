import {
	Asset,
	AssetSignalsResponse,
	PAYLOADS,
	Signal,
} from "../../src/wire/signals";

const MEASURE = { metric: "close", value: 1.5, unit: "USD" };
const PERIOD = { start: "2026-01-01", end: "2026-03-31" };
const ENVELOPE = {
	id: "a".repeat(64),
	schemaVersion: 1,
	sourceId: "src-1",
	assetId: "BTC",
	sector: null,
	area: null,
	observedAt: "2026-11-16T00:00:00.000Z",
	ingestedAt: "2026-11-16T00:01:00.000Z",
	confidenceScore: 0.9,
};
const ASSET = {
	id: "BTC",
	name: "Bitcoin",
	assetType: "crypto",
	identifier: { scheme: "ticker", ticker: "BTC" },
	applicableDimensions: ["market"],
	sector: "crypto",
};
const PAYLOAD_CASES: Record<string, unknown> = {
	market: MEASURE,
	fundamental: {
		...MEASURE,
		period: PERIOD,
		filing: { form: "10-K", id: "x", fiscalYear: 2025, fiscalPeriod: "FY" },
	},
	social: { ...MEASURE, platform: "reddit", topic: "btc", period: PERIOD },
	contextual: { ...MEASURE, location: { latitude: 1, longitude: 2 } },
	legal: { ...MEASURE, jurisdiction: "US" },
	macro: { ...MEASURE, area: "EU", period: PERIOD },
};

describe("Signal wire schema", () => {
	it.each(Object.entries(PAYLOAD_CASES))(
		"accepts a %s signal",
		(dimension, payload) => {
			expect(
				PAYLOADS[dimension as keyof typeof PAYLOADS].safeParse(payload).success
			).toBe(true);
			expect(
				Signal.safeParse({ ...ENVELOPE, dimension, payload }).success
			).toBe(true);
		}
	);

	it("rejects a signal with no subject or with two", () => {
		const base = { ...ENVELOPE, dimension: "market", payload: MEASURE };
		expect(Signal.safeParse({ ...base, assetId: null }).success).toBe(false);
		expect(Signal.safeParse({ ...base, area: "EU" }).success).toBe(false);
	});

	it("rejects an unknown payload field", () => {
		const base = { ...ENVELOPE, dimension: "market" };
		expect(
			Signal.safeParse({ ...base, payload: { ...MEASURE, x: 1 } }).success
		).toBe(false);
	});
});

describe("Asset wire schema", () => {
	it("accepts a valid asset", () => {
		expect(Asset.safeParse(ASSET).success).toBe(true);
	});

	it.each([
		[
			"identifier scheme unused for the type",
			{ identifier: { scheme: "insee", code: "75056" } },
		],
		[
			"exposure on a crypto",
			{ exposure: { assetClass: "crypto", replication: "physical" } },
		],
		["duplicate dimension", { applicableDimensions: ["market", "market"] }],
	])("rejects %s", (_name, patch) => {
		expect(Asset.safeParse({ ...ASSET, ...patch }).success).toBe(false);
	});
});

describe("AssetSignalsResponse", () => {
	it("parses what the route serves", () => {
		const body = {
			asset: ASSET,
			signals: [{ ...ENVELOPE, dimension: "market", payload: MEASURE }],
			truncated: false,
		};
		expect(AssetSignalsResponse.parse(body).signals).toHaveLength(1);
	});
});
