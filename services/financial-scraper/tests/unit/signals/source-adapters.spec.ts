import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { CFTC_COT_LEGACY } from "../../../src/adapters/outbound/signal-sources/cftc-cot-legacy";
import { ECB_SDMX_SERIES } from "../../../src/adapters/outbound/signal-sources/ecb-sdmx-series";
import { EUROSTAT_JSONSTAT } from "../../../src/adapters/outbound/signal-sources/eurostat-jsonstat";
import { FEDERAL_REGISTER_DAILY } from "../../../src/adapters/outbound/signal-sources/federal-register-daily";
import { FRED_SERIES_OBSERVATIONS } from "../../../src/adapters/outbound/signal-sources/fred-series-observations";
import { NWS_LATEST_OBSERVATION } from "../../../src/adapters/outbound/signal-sources/nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "../../../src/adapters/outbound/signal-sources/sec-edgar-company-concept";
import { SOURCE_ADAPTERS } from "../../../src/adapters/outbound/signal-sources/source-adapters";
import { WIKIMEDIA_PAGEVIEWS } from "../../../src/adapters/outbound/signal-sources/wikimedia-pageviews";
import { PAYLOADS } from "../../../src/domain/signals";

/**
 * Payloads as the sources sent them on 2026-11-04 (ECB Data Portal,
 * api.weather.gov, Wikimedia Analytics API, SEC EDGAR). The SEC one keeps 3
 * of the 341 facts of Apple's diluted EPS.
 */
function fixture(name: string): any {
	return JSON.parse(
		readFileSync(
			join(__dirname, "../../fixtures/signal-sources", `${name}.json`),
			"utf8"
		)
	);
}

const NO_PARAMS = { params: {} };

describe("SOURCE_ADAPTERS", () => {
	it("names every adapter a registry source can use", () => {
		expect([...SOURCE_ADAPTERS.keys()].sort()).toEqual([
			"cftc-cot-legacy",
			"ecb-sdmx-series",
			"eurostat-jsonstat",
			"federal-register-daily",
			"fred-series-observations",
			"nws-latest-observation",
			"sec-edgar-company-concept",
			"wikimedia-pageviews",
		]);
	});

	// The collector checks every payload against its dimension's schema.
	it.each([
		[ECB_SDMX_SERIES, "ecb-sdmx-series", { metric: "spot_rate_10y" }],
		[
			EUROSTAT_JSONSTAT,
			"eurostat-house-price-index",
			{ metric: "house_price_index", area: "FR" },
		],
		[CFTC_COT_LEGACY, "cftc-cot-legacy", {}],
		[SEC_EDGAR_COMPANY_CONCEPT, "sec-edgar-company-concept", {}],
		[
			NWS_LATEST_OBSERVATION,
			"nws-latest-observation",
			{ variables: "temperature,relativeHumidity" },
		],
		[WIKIMEDIA_PAGEVIEWS, "wikimedia-pageviews", {}],
		[
			FEDERAL_REGISTER_DAILY,
			"federal-register-daily",
			{ metric: "documents_final_rules" },
		],
	] as const)(
		"%#: writes the canonical payload of its dimension",
		(adapter, name, params) => {
			const observations = adapter.normalize(fixture(name), { params });

			expect(observations.length).toBeGreaterThan(0);
			for (const { payload } of observations) {
				expect(PAYLOADS[adapter.dimensions[0]].safeParse(payload).error).toBe(
					undefined
				);
			}
		}
	);
});

describe("fred-series-observations", () => {
	const params = {
		metric: "unemployment_rate",
		area: "US",
		unit: "percent",
		period: "month",
		series: "UNRATE",
	};

	it('keeps one signal per vintage, stamped at its publication, and skips "."', () => {
		const observations = FRED_SERIES_OBSERVATIONS.normalize(
			fixture("fred-unrate"),
			{ params }
		);
		expect(observations.map((o) => [o.key, o.payload.value])).toEqual([
			["2026-09-01@2026-10-03", 4.3],
			["2026-09-01@2026-11-07", 4.4],
		]);
		expect(observations[1]).toMatchObject({
			observedAt: Date.parse("2026-11-07"),
			payload: { period: { start: "2026-09-01", end: "2026-09-30" } },
		});
		for (const { payload } of observations) {
			expect(PAYLOADS.macro.safeParse(payload).success).toBe(true);
		}
	});

	it("gives a day and a quarter their own period", () => {
		const row = (date: string) => ({
			observations: [{ realtime_start: "2026-11-01", date, value: "1" }],
		});
		const end = (period: string, date: string) =>
			(
				FRED_SERIES_OBSERVATIONS.normalize(row(date), {
					params: { ...params, period },
				})[0].payload.period as { end: string }
			).end;
		expect(end("day", "2026-11-03")).toBe("2026-11-03");
		expect(end("quarter", "2026-07-01")).toBe("2026-09-30");
	});

	it("skips an empty value instead of reading it as 0", () => {
		const body = {
			observations: [
				{ realtime_start: "2026-11-01", date: "2026-10-01", value: " " },
			],
		};
		expect(FRED_SERIES_OBSERVATIONS.normalize(body, { params })).toEqual([]);
	});

	it("throws on a body that is not FRED observations", () => {
		expect(() =>
			FRED_SERIES_OBSERVATIONS.normalize({ error_code: 400 }, { params })
		).toThrow();
	});
});

describe("ecb-sdmx-series", () => {
	const CONTEXT = { params: { metric: "spot_rate_10y" } };

	it("reads each day of the series, without observedAt (no release time)", () => {
		const observations = ECB_SDMX_SERIES.normalize(
			fixture("ecb-sdmx-series"),
			CONTEXT
		);

		expect(observations.map((o) => [o.key, o.payload.value])).toEqual([
			["2026-10-28", 3.392748863],
			["2026-10-29", 3.3733145545],
			["2026-10-30", 3.3650469366],
			["2026-11-02", 3.3265191239],
			["2026-11-03", 3.3466052064],
		]);
		expect(observations[4]).toEqual({
			key: "2026-11-03",
			// The ECB gives no release time: the collector stamps the collection.
			payload: {
				metric: "spot_rate_10y",
				value: 3.3466052064,
				unit: "Percent per annum",
				period: { start: "2026-11-03", end: "2026-11-03" },
				details: { series: "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y" },
			},
		});
	});

	it.each([
		[
			"ecb-sdmx-hicp",
			"hicp_annual_rate",
			"2026-06",
			"2026-06-01",
			"2026-06-30",
			2.8,
		],
		[
			"ecb-sdmx-dfr",
			"deposit_facility_rate",
			"2025-06-11",
			"2025-06-11",
			"2025-06-11",
			2,
		],
		[
			"ecb-sdmx-eurusd",
			"eur_usd_reference_rate",
			"2026-11-11",
			"2026-11-11",
			"2026-11-11",
			1.1127,
		],
	])(
		"writes a macro payload for %s with the area param",
		(name, metric, key, start, end, value) => {
			const [first] = ECB_SDMX_SERIES.normalize(fixture(name), {
				params: { metric, area: "EA" },
			});

			expect(first).toMatchObject({
				key,
				payload: { metric, value, area: "EA", period: { start, end } },
			});
			expect(first).not.toHaveProperty("observedAt");
		}
	);

	it("leaves out a day without value", () => {
		const payload = fixture("ecb-sdmx-series");
		const [series] = Object.values<any>(payload.dataSets[0].series);
		series.observations["0"][0] = null;

		const observations = ECB_SDMX_SERIES.normalize(payload, CONTEXT);

		expect(observations.map((o) => o.key)).not.toContain("2026-10-28");
	});

	it("requires the metric name in the request params", () => {
		expect(ECB_SDMX_SERIES.params?.safeParse({}).success).toBe(false);
		expect(ECB_SDMX_SERIES.params?.safeParse(CONTEXT.params).success).toBe(
			true
		);
	});

	it.each([
		[
			"two series",
			(payload: any) => {
				const [series] = Object.values(payload.dataSets[0].series);
				payload.dataSets[0].series["0:0:0:0:0:0:1"] = series;
			},
			"Expected one ECB series, got 2",
		],
		[
			"a series key outside its dimensions",
			(payload: any) => {
				const [series] = Object.values(payload.dataSets[0].series);
				payload.dataSets[0].series = { "0:0:0:0:0:0:9": series };
			},
			"outside its dimensions",
		],
		[
			"no unit",
			(payload: any) => {
				payload.structure.attributes.series =
					payload.structure.attributes.series.filter(
						(attribute: { id: string }) => attribute.id !== "UNIT"
					);
			},
			"ECB series without a UNIT attribute",
		],
		[
			"a UNIT attribute without value",
			(payload: any) => {
				const position = payload.structure.attributes.series.findIndex(
					(attribute: { id: string }) => attribute.id === "UNIT"
				);
				const [series] = Object.values<any>(payload.dataSets[0].series);
				series.attributes[position] = null;
			},
			"ECB series without a UNIT attribute",
		],
		[
			"an observation outside the periods",
			(payload: any) => {
				const [series] = Object.values<any>(payload.dataSets[0].series);
				series.observations["9"] = [1];
			},
			"ECB observation 9 outside TIME_PERIOD",
		],
		[
			"a value that is no number",
			(payload: any) => {
				const [series] = Object.values<any>(payload.dataSets[0].series);
				series.observations["0"][0] = "3.39";
			},
			"",
		],
	])("throws on %s", (_label, change, message) => {
		const payload = fixture("ecb-sdmx-series");
		change(payload);

		expect(() => ECB_SDMX_SERIES.normalize(payload, CONTEXT)).toThrow(message);
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
			key: "0000320193-24-000123|2023-10-01|2024-09-28|USD/shares",
			// Filed 2024-11-01 (US Eastern): public by 05:00 UTC the next day.
			observedAt: Date.parse("2024-11-02T05:00:00Z"),
			payload: {
				metric: "us-gaap:EarningsPerShareDiluted",
				value: 6.08,
				unit: "USD/shares",
				period: { start: "2023-10-01", end: "2024-09-28" },
				filing: {
					form: "10-K",
					id: "0000320193-24-000123",
					fiscalYear: 2024,
					fiscalPeriod: "FY",
				},
				details: { frame: null },
			},
		});
	});

	it("keeps a value reported again by a later filing as another fact, observed with that filing", () => {
		const [first, again] = SEC_EDGAR_COMPANY_CONCEPT.normalize(
			fixture("sec-edgar-company-concept"),
			NO_PARAMS
		);

		expect(again.key).not.toBe(first.key);
		// FY2024 again in the FY2026 10-K, filed 2026-11-03.
		expect(again.observedAt).toBe(Date.parse("2026-11-04T05:00:00Z"));
		expect(again.payload).toMatchObject({
			value: 6.08,
			filing: { id: "0000320193-26-000026", fiscalYear: 2026 },
			details: { frame: "CY2024" },
		});
	});

	it("reads an instant fact, which covers its single day", () => {
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
		expect(observation.payload).toMatchObject({
			period: { start: "2024-09-28", end: "2024-09-28" },
			filing: { fiscalYear: null, fiscalPeriod: null },
		});
	});

	it("gives one metric to the revenue tags of two companies, each filing its own fact, units kept", () => {
		const fact = (accn: string, form: string, val: number) => ({
			start: "2023-01-01",
			end: "2023-12-31",
			val,
			accn,
			fy: 2023,
			fp: "FY",
			form,
			filed: "2024-02-01",
		});
		const revenue = (tag: string, unit: string, facts: object[]) => ({
			taxonomy: "us-gaap",
			tag,
			units: { [unit]: facts },
		});
		const params = { params: { metric: "us-gaap:Revenues" } };

		const [a, b, c] = [
			revenue("Revenues", "USD", [fact("a-1", "10-K", 5)]),
			revenue("SalesRevenueNet", "EUR", [
				fact("b-1", "10-K", 7),
				fact("b-2", "10-K/A", 8),
			]),
		].flatMap((payload) =>
			SEC_EDGAR_COMPANY_CONCEPT.normalize(payload, params)
		);

		expect([a, b, c].map((o) => o.payload.metric)).toEqual([
			"us-gaap:Revenues",
			"us-gaap:Revenues",
			"us-gaap:Revenues",
		]);
		expect(b.payload).toMatchObject({ unit: "EUR", value: 7 });
		// The 10-K/A is a second signal; the 10-K one stays.
		expect(new Set([a.key, b.key, c.key]).size).toBe(3);
	});

	it("throws on a fact without filing date", () => {
		const payload = fixture("sec-edgar-company-concept");
		delete payload.units["USD/shares"][1].filed;

		expect(() =>
			SEC_EDGAR_COMPANY_CONCEPT.normalize(payload, NO_PARAMS)
		).toThrow();
	});
});

describe("nws-latest-observation", () => {
	const CONTEXT = {
		params: {
			variables:
				"temperature,relativeHumidity,precipitationLastHour,precipitationLast3Hours",
		},
	};

	it("reads each requested variable the station reported, where and when it was measured, never as observedAt", () => {
		const observations = NWS_LATEST_OBSERVATION.normalize(
			fixture("nws-latest-observation"),
			CONTEXT
		);

		const key = String(Date.parse("2026-11-04T12:40:00Z"));
		const details = {
			qualityControl: "V",
			measuredAt: "2026-11-04T12:40:00+00:00",
		};
		const location = { latitude: 38.07, longitude: -97.87, name: "KHUT" };
		// precipitationLastHour is not in the report, precipitationLast3Hours has no value.
		expect(observations).toEqual([
			{
				key,
				payload: {
					metric: "temperature",
					value: 4,
					unit: "wmoUnit:degC",
					location,
					details,
				},
			},
			{
				key,
				payload: {
					metric: "relativeHumidity",
					value: 93.195121939331,
					unit: "wmoUnit:percent",
					location,
					details,
				},
			},
		]);
	});

	it("keeps an observation without quality control flag", () => {
		const payload = fixture("nws-latest-observation");
		delete payload.properties.temperature.qualityControl;

		const [temperature] = NWS_LATEST_OBSERVATION.normalize(payload, CONTEXT);

		expect(temperature.payload.details).toMatchObject({ qualityControl: null });
	});

	it("accepts only measured variables in the request params", () => {
		const params = NWS_LATEST_OBSERVATION.params;

		expect(
			params?.safeParse({ variables: "temperature,windSpeed" }).success
		).toBe(true);
		expect(params?.safeParse({ variables: "elevation" }).success).toBe(false);
		expect(params?.safeParse({ variables: "temprature" }).success).toBe(false);
	});

	it.each([
		[
			"a variable without unit",
			(p: any) => {
				delete p.properties.temperature.unitCode;
			},
		],
		[
			"a time without offset",
			(p: any) => {
				p.properties.timestamp = "2026-11-04 12:40";
			},
		],
	])("throws on %s", (_label, change) => {
		const payload = fixture("nws-latest-observation");
		change(payload);

		expect(() => NWS_LATEST_OBSERVATION.normalize(payload, CONTEXT)).toThrow();
	});
});

describe("wikimedia-pageviews", () => {
	it("reads each counted day, without observedAt (no release time)", () => {
		const observations = WIKIMEDIA_PAGEVIEWS.normalize(
			fixture("wikimedia-pageviews"),
			NO_PARAMS
		);

		expect(observations).toHaveLength(8);
		expect(observations[7]).toEqual({
			key: "2026-11-03",
			// No release time in the API: the collector stamps the collection.
			payload: {
				metric: "pageviews",
				value: 3751,
				unit: "views",
				platform: "en.wikipedia",
				topic: "Bitcoin",
				period: { start: "2026-11-03", end: "2026-11-03" },
			},
		});
	});

	it("throws on an hourly series", () => {
		const payload = fixture("wikimedia-pageviews");
		payload.items[0].granularity = "hourly";

		expect(() => WIKIMEDIA_PAGEVIEWS.normalize(payload, NO_PARAMS)).toThrow();
	});
});

describe("eurostat-jsonstat", () => {
	const hpi = { params: { metric: "house_price_index", area: "FR" } };

	it("reads a quarter whole, keeps the provisional flag, stamps the update time", () => {
		const observations = EUROSTAT_JSONSTAT.normalize(
			fixture("eurostat-house-price-index"),
			hpi
		);

		expect(observations.map((o) => o.key)).toEqual([
			"2025-Q4:127.46",
			"2026-Q1:126.56",
			"2026-Q2:125.54",
		]);
		expect(observations[2]).toEqual({
			key: "2026-Q2:125.54",
			observedAt: Date.parse("2026-10-01T11:00:00+0200"),
			payload: {
				metric: "house_price_index",
				value: 125.54,
				unit: "I15_Q",
				area: "FR",
				period: { start: "2026-04-01", end: "2026-06-30" },
				details: { flag: "p" },
			},
		});
	});

	it("reads a month, and leaves out a missing value", () => {
		const observations = EUROSTAT_JSONSTAT.normalize(
			fixture("eurostat-unemployment"),
			{ params: { metric: "unemployment_rate", area: "DE" } }
		);

		// The fixture has no value for 2026-10.
		expect(observations.map((o) => o.payload.period)).toEqual([
			{ start: "2026-07-01", end: "2026-07-31" },
			{ start: "2026-08-01", end: "2026-08-31" },
			{ start: "2026-09-01", end: "2026-09-30" },
		]);
	});

	it("gives a revised value another key, so a second signal", () => {
		const payload = fixture("eurostat-hicp");
		payload.value["3"] = 3.9;

		const keys = EUROSTAT_JSONSTAT.normalize(payload, {
			params: { metric: "hicp_annual_rate", area: "FR" },
		}).map((o) => o.key);

		expect(keys).toContain("2026-10:3.9");
		expect(keys).not.toContain("2026-10:3.8");
	});

	it("throws on a country the answer does not hold", () => {
		const payload = fixture("eurostat-hicp");
		payload.size[3] = 0;
		payload.dimension.geo.category.index = {};
		payload.value = {};

		expect(() =>
			EUROSTAT_JSONSTAT.normalize(payload, {
				params: { metric: "hicp_annual_rate", area: "FR" },
			})
		).toThrow("not one series of one geo");
	});
});

describe("federal-register-daily", () => {
	it("gives an explicit zero for a day without publication, stamped at the close of the day", () => {
		const observations = FEDERAL_REGISTER_DAILY.normalize(
			fixture("federal-register-daily"),
			{ params: { metric: "documents_final_rules" } }
		);

		expect(observations).toHaveLength(9);
		expect(observations[1]).toEqual({
			key: "2026-11-06",
			observedAt: Date.UTC(2026, 10, 7, 5),
			payload: {
				metric: "documents_final_rules",
				value: 1,
				unit: "documents",
				jurisdiction: "US",
			},
		});
		expect(observations[6].payload.value).toBe(0); // 2026-11-11, Veterans Day
	});

	it("throws on a changed format", () => {
		expect(() =>
			FEDERAL_REGISTER_DAILY.normalize(
				{ results: [] },
				{ params: { metric: "m" } }
			)
		).toThrow();
	});
});

describe("cftc-cot-legacy", () => {
	const rows = fixture("cftc-cot-legacy");

	it("nets the positions and stamps the Friday release after the Tuesday", () => {
		const observations = CFTC_COT_LEGACY.normalize([rows[0]], NO_PARAMS);

		expect(observations.map(({ payload }) => payload)).toEqual([
			expect.objectContaining({ metric: "net_position_funds" }),
			expect.objectContaining({ metric: "net_position_producers" }),
			expect.objectContaining({ metric: "open_interest" }),
		]);
		const [funds, producers, openInterest] = observations;
		expect(funds.payload.value).toBe(
			Number(rows[0].noncomm_positions_long_all) -
				Number(rows[0].noncomm_positions_short_all)
		);
		expect(producers.payload.value).toBe(
			Number(rows[0].comm_positions_long_all) -
				Number(rows[0].comm_positions_short_all)
		);
		expect(openInterest.payload.value).toBe(Number(rows[0].open_interest_all));
		// 2026-11-03 is a Tuesday: released Friday 6 Nov 15:30 EST = 20:30Z
		expect(funds.key).toBe("2026-11-03");
		expect(funds.observedAt).toBe(Date.parse("2026-11-06T20:30:00Z"));
	});

	it("follows daylight saving time", () => {
		const [{ observedAt }] = CFTC_COT_LEGACY.normalize(
			[{ ...rows[0], report_date_as_yyyy_mm_dd: "2026-10-27T00:00:00.000" }],
			NO_PARAMS
		);

		expect(observedAt).toBe(Date.parse("2026-10-30T19:30:00Z"));
	});

	it.each([
		["2026-11-24", "2026-11-30T20:30:00Z"], // Thanksgiving week: Monday
		["2026-12-22", "2026-12-28T20:30:00Z"], // Christmas observed Friday
	])("delays the release of %s past a federal holiday", (tuesday, release) => {
		const [{ observedAt }] = CFTC_COT_LEGACY.normalize(
			[{ ...rows[0], report_date_as_yyyy_mm_dd: `${tuesday}T00:00:00.000` }],
			NO_PARAMS
		);

		expect(observedAt).toBe(Date.parse(release));
	});

	it("gives nothing for a week without report", () => {
		expect(CFTC_COT_LEGACY.normalize([], NO_PARAMS)).toEqual([]);
	});

	it("throws on a missing or blank field", () => {
		const { open_interest_all: _, ...missing } = rows[0];

		expect(() => CFTC_COT_LEGACY.normalize([missing], NO_PARAMS)).toThrow();
		expect(() =>
			CFTC_COT_LEGACY.normalize(
				[{ ...rows[0], open_interest_all: "" }],
				NO_PARAMS
			)
		).toThrow();
	});
});
