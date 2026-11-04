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

function assetOf(file: any, id: string): any {
	return file.assets.find((asset: { id: string }) => asset.id === id);
}

describe("signal registry — the shipped file", () => {
	it("loads with test sources of the four MVP dimensions", () => {
		const dimensions = SIGNAL_REGISTRY.sources.flatMap((source) =>
			source.requests.map((request) => request.dimension)
		);

		expect([...new Set(dimensions)].sort()).toEqual([
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
			(source) => source.id === "nws-kansas-wheat-belt"
		);

		expect(weather?.requests.map((request) => request.subject)).toEqual([
			{ sector: "agriculture" },
		]);
	});

	it("only holds sources free for any use, without key", () => {
		const policies = SIGNAL_REGISTRY.sources.map((s) => s.accessPolicy);

		expect(new Set(policies.map((p) => p.terms))).toEqual(
			new Set(["attribution", "public-domain"])
		);
		expect(policies.every((p) => p.auth === "none")).toBe(true);
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
			"a protocol without worker",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").protocol = "html_scrape";
			},
			"source wikipedia-pageviews: no worker for protocol html_scrape",
		],
		[
			"an invalid schedule",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").schedule = "every hour";
			},
			'source wikipedia-pageviews: invalid schedule "every hour"',
		],
		[
			"a dimension the source does not cover",
			(file: any) => {
				sourceOf(file, "sec-edgar-eps-diluted").requests[0].dimension = "legal";
			},
			"source sec-edgar-eps-diluted, request 0: legal is not covered by the source or not applicable to its subject",
		],
		[
			"a dimension that does not apply to the asset",
			(file: any) => {
				const pageviews = sourceOf(file, "wikipedia-pageviews");
				pageviews.covers.push({ assetType: "bond", dimension: "social" });
				pageviews.requests[0].subject = { assetId: "EA_AAA_10Y" };
			},
			"source wikipedia-pageviews, request 0: social is not covered by the source or not applicable to its subject",
		],
		[
			"a dimension whose payload the adapter does not write",
			(file: any) => {
				const weather = sourceOf(file, "nws-kansas-wheat-belt");
				weather.covers.push({
					assetType: "commodity_proxy",
					dimension: "macro",
				});
				weather.requests[0].dimension = "macro";
			},
			"source nws-kansas-wheat-belt, request 0: adapter nws-latest-observation writes no macro payload",
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
			"a dimension outside the schema (real estate is an asset type)",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").requests[0].dimension =
					"real_estate";
			},
		],
		[
			"an asset type outside the schema (commodities go through a proxy)",
			(file: any) => {
				assetOf(file, "WHEAT").assetType = "commodity";
			},
		],
		[
			"an identifier scheme the asset type does not use",
			(file: any) => {
				assetOf(file, "BTC").identifier = {
					scheme: "insee",
					code: "75056",
				};
			},
		],
		[
			"a dimension listed twice for an asset",
			(file: any) => {
				assetOf(file, "BTC").applicableDimensions.push("market");
			},
		],
		[
			"a request without dimension",
			(file: any) => {
				delete sourceOf(file, "wikipedia-pageviews").requests[0].dimension;
			},
		],
		[
			"a source that covers nothing",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").covers = [];
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
			"a source that needs a key",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.auth = "api_key";
			},
		],
		[
			"no request rate",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.maxRequestsPerMinute =
					0;
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
