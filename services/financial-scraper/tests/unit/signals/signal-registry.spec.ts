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
			"source binance-ticker-24h declared twice",
		],
		[
			"a request on an unknown asset",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").requests[0].subject = {
					assetId: "DOGE",
				};
			},
			"source mastodon-hashtags, request 0: unknown asset DOGE",
		],
		[
			"a request on a sector without asset",
			(file: any) => {
				sourceOf(file, "open-meteo-wheat-belt").requests[0].subject = {
					sector: "energy",
				};
			},
			"source open-meteo-wheat-belt, request 0: no asset in sector energy",
		],
		[
			"an unknown adapter",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").adapter = "reddit";
			},
			"source mastodon-hashtags: unknown adapter reddit",
		],
		[
			"an invalid schedule",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").schedule = "every hour";
			},
			'source mastodon-hashtags: invalid schedule "every hour"',
		],
		[
			"params the adapter cannot use",
			(file: any) => {
				sourceOf(file, "binance-ticker-24h").requests[1].params = {
					baseAsset: "ETH",
				};
			},
			"source binance-ticker-24h, request 1: params",
		],
	])("refuses %s", (_label, breakIt, message) => {
		const file = registry();
		breakIt(file);

		expect(() => parseSignalRegistry(file)).toThrow(message);
	});

	it("reports every problem at once", () => {
		const file = registry();
		sourceOf(file, "mastodon-hashtags").adapter = "reddit";
		sourceOf(file, "mastodon-hashtags").schedule = "every hour";

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
				sourceOf(file, "mastodon-hashtags").requests[0].url =
					"http://mastodon.social/api/v1/tags/bitcoin";
			},
		],
		[
			"a protocol without worker",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").protocol = "html_scrape";
			},
		],
		[
			"a dimension outside the schema",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").dimension = "astrology";
			},
		],
		[
			"a reliability above 1",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").reliabilityScore = 1.5;
			},
		],
		[
			"a subject naming both an asset and a sector",
			(file: any) => {
				sourceOf(file, "mastodon-hashtags").requests[0].subject = {
					assetId: "BTC",
					sector: "crypto",
				};
			},
		],
	])("refuses %s (schema)", (_label, breakIt) => {
		const file = registry();
		breakIt(file);

		expect(() => parseSignalRegistry(file)).toThrow();
	});
});
