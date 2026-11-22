import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { PAYLOADS } from "@trading-model/contracts/wire/signals";
import { z } from "zod";
import {
	CFTC_COT_LEGACY,
	newYorkLocalToUtc,
} from "../../../../../src/adapters/outbound/signal-sources/cftc-cot-legacy";
import { DVF_COMMUNE_SALES } from "../../../../../src/adapters/outbound/signal-sources/dvf-commune-sales";
import { ECB_SDMX_SERIES } from "../../../../../src/adapters/outbound/signal-sources/ecb-sdmx-series";
import { EIA_OPEN_DATA } from "../../../../../src/adapters/outbound/signal-sources/eia-open-data";
import { EUROSTAT_JSONSTAT } from "../../../../../src/adapters/outbound/signal-sources/eurostat-jsonstat";
import { FEDERAL_REGISTER_DAILY } from "../../../../../src/adapters/outbound/signal-sources/federal-register-daily";
import { FRED_SERIES_OBSERVATIONS } from "../../../../../src/adapters/outbound/signal-sources/fred-series-observations";
import { NASA_POWER_DAILY } from "../../../../../src/adapters/outbound/signal-sources/nasa-power-daily";
import { NWS_LATEST_OBSERVATION } from "../../../../../src/adapters/outbound/signal-sources/nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "../../../../../src/adapters/outbound/signal-sources/sec-edgar-company-concept";
import { SOURCE_ADAPTERS } from "../../../../../src/adapters/outbound/signal-sources/source-adapters";
import { TREASURY_PAR_YIELD_CURVE } from "../../../../../src/adapters/outbound/signal-sources/treasury-par-yield-curve";
import { TWELVEDATA_DAILY_PRICES } from "../../../../../src/adapters/outbound/signal-sources/twelvedata-daily-prices";
import { WIKIMEDIA_PAGEVIEWS } from "../../../../../src/adapters/outbound/signal-sources/wikimedia-pageviews";
import { signalId } from "../../../../../src/application/signal-collector";

/**
 * Payloads as the sources sent them on 2026-11-04 (ECB Data Portal,
 * api.weather.gov, Wikimedia Analytics API, SEC EDGAR). The SEC one keeps 3
 * of the 341 facts of Apple's diluted EPS.
 */
function fixture(name: string): any {
	return JSON.parse(
		readFileSync(
			join(__dirname, "../../../../fixtures/signal-sources", `${name}.json`),
			"utf8"
		)
	);
}

const NO_PARAMS = { params: {} };

describe("SOURCE_ADAPTERS", () => {
	it("names every adapter a registry source can use", () => {
		expect([...SOURCE_ADAPTERS.keys()].sort()).toEqual([
			"cftc-cot-legacy",
			"dvf-commune-sales",
			"ecb-sdmx-series",
			"eia-open-data",
			"eurostat-jsonstat",
			"federal-register-daily",
			"fred-series-observations",
			"nasa-power-daily",
			"nws-latest-observation",
			"sec-edgar-company-concept",
			"treasury-par-yield-curve",
			"twelvedata-daily-prices",
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
		[TWELVEDATA_DAILY_PRICES, "twelvedata-daily-prices", {}],
		[DVF_COMMUNE_SALES, "dvf-commune-sales", {}],
		[SEC_EDGAR_COMPANY_CONCEPT, "sec-edgar-company-concept", {}],
		[
			NWS_LATEST_OBSERVATION,
			"nws-latest-observation",
			{ variables: "temperature,relativeHumidity" },
		],
		[
			NASA_POWER_DAILY,
			"nasa-power-daily",
			{ name: "poltava-ua", variables: "T2M,PRECTOTCORR" },
		],
		[
			TREASURY_PAR_YIELD_CURVE,
			"treasury-par-yield-curve",
			{ column: "10 Yr", metric: "par_yield_10y" },
		],
		[WIKIMEDIA_PAGEVIEWS, "wikimedia-pageviews", {}],
		[EIA_OPEN_DATA, "eia-open-data", { metric: "crude_oil_stocks" }],
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

describe("eia-open-data", () => {
	const crude = fixture("eia-open-data");
	const CONTEXT = { params: { metric: "crude_oil_stocks" } };

	it("reads the value and unit of a week, the newest at the report time", () => {
		const [latest, previous] = EIA_OPEN_DATA.normalize(crude, CONTEXT);

		expect(latest.payload).toMatchObject({
			metric: "crude_oil_stocks",
			value: 414417,
			unit: "MBBL",
			details: { weekEnding: "2026-11-06" },
		});
		// Veterans Day (Wednesday 11 Nov) delays the report to Thursday 10:30 EST.
		expect(latest.observedAt).toBe(Date.parse("2026-11-12T15:30:00Z"));
		expect(previous.observedAt).toBeUndefined();
		expect(latest.key).toBe("2026-11-06|414417");
	});

	it("reports on Wednesday, one hour earlier in UTC under daylight saving time", () => {
		const row = (period: string) => ({
			response: { data: [{ period, value: "1", units: "MBBL" }] },
		});

		expect(
			EIA_OPEN_DATA.normalize(row("2026-10-30"), CONTEXT)[0].observedAt
		).toBe(Date.parse("2026-11-04T15:30:00Z"));
		expect(
			EIA_OPEN_DATA.normalize(row("2026-10-23"), CONTEXT)[0].observedAt
		).toBe(Date.parse("2026-10-28T14:30:00Z"));
	});

	it("delays the report past a Monday holiday", () => {
		const [{ observedAt }] = EIA_OPEN_DATA.normalize(
			{
				response: {
					data: [{ period: "2027-01-15", value: "1", units: "MBBL" }],
				},
			},
			CONTEXT
		);

		// Martin Luther King Day, Monday 18 Jan 2027: the report moves to Thursday.
		expect(observedAt).toBe(Date.parse("2027-01-21T15:30:00Z"));
	});

	it("dates natural gas storage at the collection, its Thursday report is not the petroleum one", () => {
		const gas = Object.values(fixture("eia-open-data-series")).find(
			(body) =>
				(body as { response: { data: { units: string }[] } }).response.data[0]
					.units === "BCF"
		);

		const [{ observedAt }] = EIA_OPEN_DATA.normalize(gas, {
			params: { metric: "natural_gas_storage" },
		});

		expect(observedAt).toBeUndefined();
	});

	it("never dates a late report before the collection window, keeps an on-time one", () => {
		const published = Date.parse("2026-11-12T15:30:00Z");
		const late = published + 14 * 86_400_000;
		const at = (ingestedAt: number) =>
			EIA_OPEN_DATA.normalize(crude, { ...CONTEXT, ingestedAt })[0].observedAt;

		expect(at(published + 600_000)).toBe(published);
		expect(at(late)).toBe(late - 3_600_000);
	});

	it("keeps a revised value as a second signal", () => {
		const revised = structuredClone(crude);
		revised.response.data[0].value = "414000";

		const keys = [crude, revised].map(
			(body) => EIA_OPEN_DATA.normalize(body, CONTEXT)[0].key
		);

		expect(new Set(keys).size).toBe(2);
	});

	it("reads the other series with their units", () => {
		const units = Object.values(fixture("eia-open-data-series")).map(
			(body) => EIA_OPEN_DATA.normalize(body, CONTEXT)[0].payload.unit
		);

		expect(units).toEqual(["MBBL", "BCF", "MBBL/D"]);
	});

	it("throws on a changed format", () => {
		expect(() =>
			EIA_OPEN_DATA.normalize({ response: { rows: [] } }, CONTEXT)
		).toThrow();
	});
});

describe("cftc-cot-legacy", () => {
	it.each([
		["winter (EST)", "2025-01-15", "2025-01-15T20:30:00.000Z"],
		["summer (EDT)", "2025-07-15", "2025-07-15T19:30:00.000Z"],
	])("converts 15:30 New York in %s", (_name, day, expected) => {
		expect(
			new Date(newYorkLocalToUtc(Date.parse(day), 15, 30)).toISOString()
		).toBe(expected);
	});

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

	it("never dates a late report before the collection window, keeps an on-time one", () => {
		const published = Date.parse("2026-11-06T20:30:00Z");
		const late = published + 14 * 86_400_000;
		const at = (ingestedAt: number) =>
			CFTC_COT_LEGACY.normalize([rows[0]], { params: {}, ingestedAt })[0]
				.observedAt;

		expect(at(published + 600_000)).toBe(published);
		expect(at(late)).toBe(late - 3_600_000);
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

describe("dvf-commune-sales", () => {
	// Bordeaux 2025 (geo-dvf, 2026-11-16): 3 sales kept, 2 with several dwellings of different surfaces.
	const rows: Record<string, string>[] = fixture("dvf-commune-sales");
	const metrics = (payload: unknown) =>
		Object.fromEntries(
			DVF_COMMUNE_SALES.normalize(payload, NO_PARAMS).map(({ payload: p }) => [
				p.metric,
				p,
			])
		);

	const extra = (type: string, count: number) =>
		Array.from({ length: count }, (_, i) => ({
			...rows[0],
			id_mutation: `2025-extra-${type}-${i}`,
			nature_mutation: "Vente",
			type_local: type,
			surface_reelle_bati: "50",
			valeur_fonciere: "200000",
		}));

	it("counts a multi-lot sale once and publishes no median under 11 sales", () => {
		const out = metrics(rows);

		expect(out.sales_count?.value).toBe(3);
		expect(out.median_price_per_m2_apartment).toBeUndefined();
		expect(out.median_price_per_m2_house).toBeUndefined();
		expect(out.sales_count?.details).toEqual({ excluded: 2 });
		expect(out.sales_count?.period).toEqual({
			start: "2025-01-01",
			end: "2025-12-31",
		});
	});

	it("publishes a median from 11 sales of its type, not from 10", () => {
		const out = metrics([...extra("Maison", 10), ...extra("Appartement", 11)]);

		expect(out.sales_count?.value).toBe(21);
		expect(out.median_price_per_m2_apartment?.value).toBe(4000);
		expect(out.median_price_per_m2_house).toBeUndefined();
	});

	it("excludes sales without price or surface and counts them", () => {
		const bad = rows.map((row) =>
			row.id_mutation === "2025-384863"
				? { ...row, valeur_fonciere: "" }
				: row.id_mutation === "2025-384864"
					? { ...row, surface_reelle_bati: "" }
					: row
		);

		expect(metrics(bad).sales_count?.details).toEqual({ excluded: 4 });
	});

	it("reads two identical dwelling rows as one dwelling (known limit)", () => {
		const twin = [
			...rows,
			...["a", "b"].map((id) => ({
				...rows[0],
				id_mutation: "2025-twin",
				id_parcelle: id,
				type_local: "Appartement",
				surface_reelle_bati: "50",
				valeur_fonciere: "200000",
			})),
		];

		expect(metrics(twin).sales_count?.value).toBe(4);
		expect(metrics(twin).sales_count?.details).toEqual({ excluded: 2 });
	});

	it("leaks no field of an individual sale", () => {
		const text = JSON.stringify(DVF_COMMUNE_SALES.normalize(rows, NO_PARAMS));

		expect(text).not.toMatch(
			/2025-38|500000|370000|296850|valeur|adresse|parcelle/
		);
	});

	it("gives no signal and no error for a commune without sale, and throws on a changed format", () => {
		expect(DVF_COMMUNE_SALES.normalize([], NO_PARAMS)).toEqual([]);
		expect(() =>
			DVF_COMMUNE_SALES.normalize([{ id_mutation: "x" }], NO_PARAMS)
		).toThrow();
	});
});

describe("nasa-power-daily", () => {
	it("keeps the latest day with a value, skips fill values and absent variables", () => {
		const observations = NASA_POWER_DAILY.normalize(
			fixture("nasa-power-daily"),
			{
				params: {
					name: "poltava-ua",
					variables: "T2M,PRECTOTCORR,GWETROOT,NOPE",
				},
			}
		);

		expect(
			observations.map((o) => [
				o.payload.metric,
				o.payload.value,
				o.payload.unit,
			])
		).toEqual([
			["T2M", 3.15, "C"],
			["PRECTOTCORR", 1.33, "mm/day"],
			["GWETROOT", 0.54, "1"],
		]);
		expect(observations[0].payload.details).toEqual({
			measuredAt: "2026-11-12",
		});
	});

	it("gives no signal for a point with no value", () => {
		const empty = {
			geometry: { coordinates: [1, 2] },
			properties: { parameter: { T2M: { "20261112": -999 } } },
			parameters: { T2M: { units: "C" } },
		};
		expect(
			NASA_POWER_DAILY.normalize(empty, {
				params: { name: "x", variables: "T2M" },
			})
		).toEqual([]);
	});

	it("gives two points of the same day two distinct ids", () => {
		const keyOf = (name: string) =>
			NASA_POWER_DAILY.normalize(fixture("nasa-power-daily"), {
				params: { name, variables: "T2M" },
			})[0].key;
		const subject = { sector: "agriculture" } as const;
		expect(signalId("s", subject, "T2M", keyOf("beauce-fr"))).not.toBe(
			signalId("s", subject, "T2M", keyOf("poltava-ua"))
		);
	});

	it("rejects a changed format", () => {
		expect(() =>
			NASA_POWER_DAILY.normalize(
				{ properties: {} },
				{ params: { name: "x", variables: "T2M" } }
			)
		).toThrow();
	});
});

describe("treasury-par-yield-curve", () => {
	const rows = fixture("treasury-par-yield-curve");
	const context = (column: string) => ({
		params: { column, metric: "par_yield_2y" },
	});

	it("gives one value per day for the requested maturity, keyed by the day", () => {
		const observations = TREASURY_PAR_YIELD_CURVE.normalize(
			rows,
			context("2 Yr")
		);

		expect(
			observations.map(({ key, payload }) => [key, payload.value])
		).toEqual(
			rows.map((row: any) => [
				row.Date.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"),
				Number(row["2 Yr"]),
			])
		);
		expect(observations[0].payload).toMatchObject({
			unit: "percent",
			period: { start: observations[0].key, end: observations[0].key },
		});
	});

	it("skips a maturity not published (N/A, blank) and a day without a row", () => {
		const gaps = [
			{ ...rows[0], "2 Yr": "N/A" },
			{ ...rows[1], "2 Yr": "" },
		];

		expect(TREASURY_PAR_YIELD_CURVE.normalize(gaps, context("2 Yr"))).toEqual(
			[]
		);
		expect(TREASURY_PAR_YIELD_CURVE.normalize([], context("2 Yr"))).toEqual([]);
	});

	it("throws on a changed format", () => {
		expect(() =>
			TREASURY_PAR_YIELD_CURVE.normalize(rows, context("2 Year"))
		).toThrow('without a "2 Year" column');
		expect(() =>
			TREASURY_PAR_YIELD_CURVE.normalize(
				[{ ...rows[0], "2 Yr": "abc" }],
				context("2 Yr")
			)
		).toThrow();
		expect(() =>
			TREASURY_PAR_YIELD_CURVE.normalize(
				[{ Date: "2026-11-13" }],
				context("2 Yr")
			)
		).toThrow();
	});
});

describe("twelvedata-daily-prices", () => {
	it("gives five metrics per session, keyed and dated by the session day", () => {
		const observations = TWELVEDATA_DAILY_PRICES.normalize(
			fixture("twelvedata-daily-prices"),
			NO_PARAMS
		);

		expect(
			observations.map((o) => [o.payload.metric, o.payload.value])
		).toEqual([
			["open", 272],
			["high", 275.1],
			["low", 271.2],
			["close", 273.5],
			["volume", 48210000],
		]);
		expect(new Set(observations.map((o) => o.key))).toEqual(
			new Set(["2026-11-13"])
		);
		expect(observations[0].payload.period).toEqual({
			start: "2026-11-13",
			end: "2026-11-13",
		});
		// No release time: the collection time stands, never before the close.
		expect(observations.every((o) => o.observedAt === undefined)).toBe(true);
	});

	it("throws a 429 HttpStatusError for a quota body sent with HTTP 200", () => {
		const body = { code: 429, message: "out of API credits", status: "error" };

		expect(() => TWELVEDATA_DAILY_PRICES.normalize(body, NO_PARAMS)).toThrow(
			expect.objectContaining({ name: "HttpStatusError", status: 429 })
		);
		expect(() =>
			TWELVEDATA_DAILY_PRICES.normalize({ ...body, code: 400 }, NO_PARAMS)
		).toThrow(z.ZodError);
	});

	it("gives nothing for a day without quotation (no value)", () => {
		expect(
			TWELVEDATA_DAILY_PRICES.normalize({ values: [] }, NO_PARAMS)
		).toEqual([]);
	});

	it.each([
		["a missing value", (r: any) => ({ values: [{ ...r, close: undefined }] })],
		["a null value", (r: any) => ({ values: [{ ...r, close: null }] })],
		["an empty value", (r: any) => ({ values: [{ ...r, close: "" }] })],
		[
			"a changed format",
			() => ({ code: 401, message: "Invalid API key", status: "error" }),
		],
	])("throws on %s", (_name, change) => {
		const [row] = fixture("twelvedata-daily-prices").values;

		expect(() =>
			TWELVEDATA_DAILY_PRICES.normalize(change(row), NO_PARAMS)
		).toThrow();
	});
});
