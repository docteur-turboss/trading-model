import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { ECB_SDMX_SERIES } from "../../../src/adapters/outbound/signal-sources/ecb-sdmx-series";
import { NWS_LATEST_OBSERVATION } from "../../../src/adapters/outbound/signal-sources/nws-latest-observation";
import { SEC_EDGAR_COMPANY_CONCEPT } from "../../../src/adapters/outbound/signal-sources/sec-edgar-company-concept";
import { SOURCE_ADAPTERS } from "../../../src/adapters/outbound/signal-sources/source-adapters";
import { WIKIMEDIA_PAGEVIEWS } from "../../../src/adapters/outbound/signal-sources/wikimedia-pageviews";

/**
 * Payloads as the sources sent them on 2026-11-04 (ECB Data Portal,
 * api.weather.gov, Wikimedia Analytics API). SEC EDGAR answers 403 to a
 * User-Agent without contact, so its fixture follows the documented
 * companyconcept format, with the values of Apple's FY2024 10-K and Q1 FY2025
 * 10-Q; it was not fetched.
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
			"ecb-sdmx-series",
			"nws-latest-observation",
			"sec-edgar-company-concept",
			"wikimedia-pageviews",
		]);
	});
});

describe("ecb-sdmx-series", () => {
	const CONTEXT = {
		params: { metric: "spot_rate_10y" },
		collectedAt: COLLECTED_AT,
	};

	it("reads each period of the series, observed when first collected", () => {
		const observations = ECB_SDMX_SERIES.normalize(
			fixture("ecb-sdmx-series"),
			CONTEXT
		);

		expect(observations.map((o) => [o.key, o.value])).toEqual([
			["2026-10-28", 3.392748863],
			["2026-10-29", 3.3733145545],
			["2026-10-30", 3.3650469366],
			["2026-11-02", 3.3265191239],
			["2026-11-03", 3.3466052064],
		]);
		expect(observations[4]).toEqual({
			metric: "spot_rate_10y",
			value: 3.3466052064,
			unit: "Percent per annum",
			// The ECB gives no release time: never before the collection.
			observedAt: COLLECTED_AT,
			key: "2026-11-03",
			attributes: {
				period: "2026-11-03",
				series: "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y",
			},
		});
	});

	it("leaves out a period without value", () => {
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

describe("nws-latest-observation", () => {
	const CONTEXT = {
		params: {
			variables:
				"temperature,relativeHumidity,precipitationLastHour,precipitationLast3Hours",
		},
		collectedAt: COLLECTED_AT,
	};

	it("reads each requested variable the station reported, at the observation time", () => {
		const observations = NWS_LATEST_OBSERVATION.normalize(
			fixture("nws-latest-observation"),
			CONTEXT
		);

		const common = {
			observedAt: Date.parse("2026-11-04T12:40:00Z"),
			key: String(Date.parse("2026-11-04T12:40:00Z")),
		};
		const station = { stationId: "KHUT", latitude: 38.07, longitude: -97.87 };
		// precipitationLastHour is not in the report, precipitationLast3Hours has no value.
		expect(observations).toEqual([
			{
				...common,
				metric: "temperature",
				value: 4,
				unit: "wmoUnit:degC",
				attributes: { ...station, qualityControl: "V" },
			},
			{
				...common,
				metric: "relativeHumidity",
				value: 93.195121939331,
				unit: "wmoUnit:percent",
				attributes: { ...station, qualityControl: "V" },
			},
		]);
	});

	it("keeps an observation without quality control flag", () => {
		const payload = fixture("nws-latest-observation");
		delete payload.properties.temperature.qualityControl;

		const [temperature] = NWS_LATEST_OBSERVATION.normalize(payload, CONTEXT);

		expect(temperature.attributes?.qualityControl).toBeNull();
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
	it("reads each counted day, observed when first collected", () => {
		const observations = WIKIMEDIA_PAGEVIEWS.normalize(
			fixture("wikimedia-pageviews"),
			NO_PARAMS
		);

		expect(observations).toHaveLength(8);
		expect(observations[7]).toEqual({
			metric: "pageviews",
			value: 3751,
			unit: "views",
			// No release time in the API: never before the collection.
			observedAt: COLLECTED_AT,
			key: "2026-11-03",
			attributes: {
				project: "en.wikipedia",
				article: "Bitcoin",
				day: "2026-11-03",
			},
		});
	});

	it("throws on an hourly series", () => {
		const payload = fixture("wikimedia-pageviews");
		payload.items[0].granularity = "hourly";

		expect(() => WIKIMEDIA_PAGEVIEWS.normalize(payload, NO_PARAMS)).toThrow();
	});
});
