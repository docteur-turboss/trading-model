import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { BINANCE_TICKER_24H } from "../../../src/adapters/outbound/signal-sources/binance-ticker-24h";
import { MASTODON_TAG_HISTORY } from "../../../src/adapters/outbound/signal-sources/mastodon-tag-history";
import { OPEN_METEO_CURRENT } from "../../../src/adapters/outbound/signal-sources/open-meteo-current";
import { SEC_EDGAR_COMPANY_CONCEPT } from "../../../src/adapters/outbound/signal-sources/sec-edgar-company-concept";
import { SOURCE_ADAPTERS } from "../../../src/adapters/outbound/signal-sources/source-adapters";

/**
 * Payloads as the sources sent them on 2026-11-04 (Binance, Open-Meteo,
 * Mastodon). SEC EDGAR answers 403 to a User-Agent without a contact, so its
 * fixture follows the documented companyconcept format, with the values of
 * Apple's FY2024 10-K and Q1 FY2025 10-Q; it was not fetched.
 */
function fixture(name: string): any {
	return JSON.parse(
		readFileSync(
			join(__dirname, "../../fixtures/signal-sources", `${name}.json`),
			"utf8"
		)
	);
}

const COLLECTED_AT = Date.parse("2026-11-04T12:03:00Z");
const NO_PARAMS = { params: {}, collectedAt: COLLECTED_AT };

describe("SOURCE_ADAPTERS", () => {
	it("names every adapter a registry source can use", () => {
		expect([...SOURCE_ADAPTERS.keys()].sort()).toEqual([
			"binance-ticker-24h",
			"mastodon-tag-history",
			"open-meteo-current",
			"sec-edgar-company-concept",
		]);
	});
});

describe("binance-ticker-24h", () => {
	const CONTEXT = {
		params: { baseAsset: "BTC", quoteAsset: "USDT" },
		collectedAt: COLLECTED_AT,
	};

	it("reads the last price and the 24 h volume, in the units of the pair", () => {
		const observations = BINANCE_TICKER_24H.normalize(
			fixture("binance-ticker-24h"),
			CONTEXT
		);

		const common = {
			observedAt: 1793793830010,
			key: "1793793830010",
			attributes: { symbol: "BTCUSDT" },
		};
		expect(observations).toEqual([
			{ ...common, metric: "last_price", value: 78336, unit: "USDT" },
			{ ...common, metric: "volume_24h", value: 15007.92412, unit: "BTC" },
		]);
	});

	it("requires the assets of the pair in the request params", () => {
		const params = BINANCE_TICKER_24H.params;

		expect(params?.safeParse({ baseAsset: "BTC" }).success).toBe(false);
		expect(params?.safeParse(CONTEXT.params).success).toBe(true);
	});

	it.each([
		["a price that is no decimal", { lastPrice: "n/a" }],
		["no close time", { closeTime: undefined }],
	])("throws on %s", (_label, change) => {
		const payload = { ...fixture("binance-ticker-24h"), ...change };

		expect(() => BINANCE_TICKER_24H.normalize(payload, CONTEXT)).toThrow();
	});
});

describe("sec-edgar-company-concept", () => {
	it("observes each fact when its filing day is over, not at the end of its period", () => {
		const observations = SEC_EDGAR_COMPANY_CONCEPT.normalize(
			fixture("sec-edgar-company-concept"),
			NO_PARAMS
		);

		expect(observations).toHaveLength(3);
		expect(observations[0]).toEqual({
			metric: "us-gaap:EarningsPerShareDiluted",
			value: 6.08,
			unit: "USD/shares",
			// Filed 2024-11-01 (US Eastern): public by 05:00 UTC the next day.
			observedAt: Date.parse("2024-11-02T05:00:00Z"),
			key: "0000320193-24-000123|2023-10-01|2024-09-28|USD/shares",
			attributes: {
				periodStart: "2023-10-01",
				periodEnd: "2024-09-28",
				form: "10-K",
				fiscalYear: 2024,
				fiscalPeriod: "FY",
				accessionNumber: "0000320193-24-000123",
				frame: "CY2024",
			},
		});
		expect(observations[2].attributes?.frame).toBeNull();
	});

	it("keeps apart two periods of the same filing", () => {
		const [year, quarter] = SEC_EDGAR_COMPANY_CONCEPT.normalize(
			fixture("sec-edgar-company-concept"),
			NO_PARAMS
		);

		expect(year.key).not.toBe(quarter.key);
	});

	it("reads an instant fact, which has no start", () => {
		const payload = {
			taxonomy: "us-gaap",
			tag: "AssetsCurrent",
			units: {
				USD: [
					{
						end: "2024-09-28",
						val: 152987000000,
						accn: "0000320193-24-000123",
						fy: null,
						fp: null,
						form: "10-K",
						filed: "2024-11-01",
					},
				],
			},
		};

		const [observation] = SEC_EDGAR_COMPANY_CONCEPT.normalize(
			payload,
			NO_PARAMS
		);

		expect(observation.key).toBe("0000320193-24-000123||2024-09-28|USD");
		expect(observation.attributes).toMatchObject({
			periodStart: null,
			fiscalYear: null,
			fiscalPeriod: null,
		});
	});

	it("throws on a fact without filing date", () => {
		const payload = fixture("sec-edgar-company-concept");
		delete payload.units["USD/shares"][1].filed;

		expect(() =>
			SEC_EDGAR_COMPANY_CONCEPT.normalize(payload, NO_PARAMS)
		).toThrow();
	});
});

describe("open-meteo-current", () => {
	it("reads each requested variable in the unit Open-Meteo reports", () => {
		const observations = OPEN_METEO_CURRENT.normalize(
			fixture("open-meteo-current"),
			NO_PARAMS
		);

		const observedAt = Date.parse("2026-11-04T12:00:00Z");
		const attributes = {
			latitude: 38.49294,
			longitude: -98.50629,
			intervalSeconds: 900,
		};
		expect(observations).toEqual([
			{
				metric: "temperature_2m",
				value: 4.3,
				unit: "°C",
				observedAt,
				key: String(observedAt),
				attributes,
			},
			{
				metric: "precipitation",
				value: 0,
				unit: "mm",
				observedAt,
				key: String(observedAt),
				attributes,
			},
		]);
	});

	it("turns a local time into UTC with the reported offset", () => {
		const payload = fixture("open-meteo-current");
		payload.utc_offset_seconds = 3600;
		payload.current.time = "2026-11-04T13:00";

		const [observation] = OPEN_METEO_CURRENT.normalize(payload, NO_PARAMS);

		expect(observation.observedAt).toBe(Date.parse("2026-11-04T12:00:00Z"));
	});

	it("leaves out a variable the model has no value for", () => {
		const payload = fixture("open-meteo-current");
		payload.current.precipitation = null;

		const observations = OPEN_METEO_CURRENT.normalize(payload, NO_PARAMS);

		expect(observations.map((o) => o.metric)).toEqual(["temperature_2m"]);
	});

	it("throws on a variable without its unit", () => {
		const payload = fixture("open-meteo-current");
		delete payload.current_units.precipitation;

		expect(() => OPEN_METEO_CURRENT.normalize(payload, NO_PARAMS)).toThrow(
			"Open-Meteo sent precipitation without its unit"
		);
	});

	it("throws on a time in another format", () => {
		const payload = fixture("open-meteo-current");
		payload.current.time = "2026-11-04T12:00:00Z";

		expect(() => OPEN_METEO_CURRENT.normalize(payload, NO_PARAMS)).toThrow();
	});
});

describe("mastodon-tag-history", () => {
	it("observes each finished day once it is over, today's count left out", () => {
		const observations = MASTODON_TAG_HISTORY.normalize(
			fixture("mastodon-tag"),
			NO_PARAMS
		);

		// 7 days of history, the first one (2026-11-04) still in progress.
		expect(observations).toHaveLength(12);
		expect(observations.slice(0, 2)).toEqual([
			{
				metric: "hashtag_uses",
				value: 67,
				unit: "posts",
				observedAt: Date.parse("2026-11-04T00:00:00Z"),
				key: "1793664000",
				attributes: { tag: "bitcoin" },
			},
			{
				metric: "hashtag_accounts",
				value: 19,
				unit: "accounts",
				observedAt: Date.parse("2026-11-04T00:00:00Z"),
				key: "1793664000",
				attributes: { tag: "bitcoin" },
			},
		]);
	});

	it("throws on a count that is no integer", () => {
		const payload = fixture("mastodon-tag");
		payload.history[0].uses = "many";

		expect(() => MASTODON_TAG_HISTORY.normalize(payload, NO_PARAMS)).toThrow();
	});
});
