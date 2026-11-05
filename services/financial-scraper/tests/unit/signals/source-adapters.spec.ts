import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { ECB_SDMX_SERIES } from "../../../src/adapters/outbound/signal-sources/ecb-sdmx-series";
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
			"ecb-sdmx-series",
			"nws-latest-observation",
			"sec-edgar-company-concept",
			"wikimedia-pageviews",
		]);
	});

	// The collector checks every payload against its dimension's schema.
	it.each([
		[ECB_SDMX_SERIES, "ecb-sdmx-series", { metric: "spot_rate_10y" }],
		[SEC_EDGAR_COMPANY_CONCEPT, "sec-edgar-company-concept", {}],
		[
			NWS_LATEST_OBSERVATION,
			"nws-latest-observation",
			{ variables: "temperature,relativeHumidity" },
		],
		[WIKIMEDIA_PAGEVIEWS, "wikimedia-pageviews", {}],
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
