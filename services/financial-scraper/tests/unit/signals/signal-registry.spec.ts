import { describe, expect, it } from "@jest/globals";
import {
	parseSignalRegistry,
	SIGNAL_REGISTRY,
} from "../../../src/config/signal-registry";
import REGISTRY_FILE from "../../../src/config/signal-registry.json";

/** A copy of the shipped registry to break one thing at a time. */
function registry(): any {
	return structuredClone(REGISTRY_FILE);
}

function sourceOf(file: any, id: string): any {
	return file.sources.find((source: { id: string }) => source.id === id);
}

describe("signal registry — the shipped file", () => {
	it("loads with one test source per MVP dimension", () => {
		const dimensions = SIGNAL_REGISTRY.sources.map((s) => s.dimension);

		expect(dimensions.sort()).toEqual([
			"contextual",
			"fundamental",
			"market",
			"social",
		]);
		expect([...SIGNAL_REGISTRY.assets.keys()]).toEqual([
			"BTC",
			"ETH",
			"AAPL",
			"WHEAT",
			"EA_AAA_10Y",
		]);
	});

	it("gives the weather to the whole agriculture sector, not to one asset", () => {
		const weather = SIGNAL_REGISTRY.sources.find(
			(source) => source.dimension === "contextual"
		);

		expect(weather?.requests.map((request) => request.subject)).toEqual([
			{ sector: "agriculture" },
		]);
	});

	it("only holds sources free for any use", () => {
		const terms = SIGNAL_REGISTRY.sources.map((s) => s.accessPolicy.terms);

		expect(new Set(terms)).toEqual(new Set(["attribution", "public-domain"]));
	});
});

describe("parseSignalRegistry", () => {
	it.each([
		[
			"an asset declared twice",
			(file: any) => file.assets.push({ ...file.assets[0] }),
			"asset BTC declared twice",
		],
		[
			"a source declared twice",
			(file: any) => file.sources.push({ ...file.sources[0] }),
			"source ecb-aaa-yield-10y declared twice",
		],
		[
			"a request on an unknown asset",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").requests[0].subject = {
					assetId: "DOGE",
				};
			},
			"source wikipedia-pageviews, request 0: unknown asset DOGE",
		],
		[
			"a request on a sector without asset",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").requests[0].subject = {
					sector: "energy",
				};
			},
			"source nws-kansas-wheat-belt, request 0: no asset in sector energy",
		],
		[
			"an unknown adapter",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").adapter = "reddit";
			},
			"source wikipedia-pageviews: unknown adapter reddit",
		],
		[
			"an invalid schedule",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").schedule = "every hour";
			},
			'source wikipedia-pageviews: invalid schedule "every hour"',
		],
		[
			"params the adapter cannot use",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").requests[0].params = {
					variables: "elevation",
				};
			},
			"source nws-kansas-wheat-belt, request 0: params",
		],
		[
			"a URL placeholder other than {date-N}",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").requests[1].url =
					"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Ethereum/daily/{today}/{date-1}";
			},
			"source wikipedia-pageviews, request 1: URL placeholder other than {date-N}",
		],
	])("refuses %s", (_label, breakIt, message) => {
		const file = registry();
		breakIt(file);

		expect(() => parseSignalRegistry(file)).toThrow(message);
	});

	it("reports every problem at once", () => {
		const file = registry();
		sourceOf(file, "wikipedia-pageviews").adapter = "reddit";
		sourceOf(file, "wikipedia-pageviews").schedule = "every hour";

		expect(() => parseSignalRegistry(file)).toThrow(
			/unknown adapter reddit; .*invalid schedule/
		);
	});

	it.each([
		[
			"another schema version",
			(file: any) => {
				file.schemaVersion = 2;
			},
		],
		[
			"a URL in clear",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").requests[0].url =
					"http://api.weather.gov/stations/KHUT/observations/latest";
			},
		],
		[
			"a protocol without worker",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").protocol = "html_scrape";
			},
		],
		[
			"a dimension outside the schema",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").dimension = "astrology";
			},
		],
		[
			"a reliability above 1",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").reliabilityScore = 1.5;
			},
		],
		[
			"a subject naming both an asset and a sector",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").requests[0].subject = {
					assetId: "BTC",
					sector: "crypto",
				};
			},
		],
		[
			"terms that restrict the use (non-commercial)",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").accessPolicy.terms =
					"non-commercial";
			},
		],
		[
			"attribution terms without the credit to give",
			(file: any) => {
				delete sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.attribution;
			},
		],
		[
			"a source without terms of use",
			(file: any) => {
				delete sourceOf(file, "wikipedia-pageviews").accessPolicy;
			},
		],
	])("refuses %s (schema)", (_label, breakIt) => {
		const file = registry();
		breakIt(file);

		expect(() => parseSignalRegistry(file)).toThrow();
	});
});
