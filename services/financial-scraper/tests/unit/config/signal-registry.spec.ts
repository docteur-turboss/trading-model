import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { Signal } from "@trading-model/contracts/wire/signals";
import {
	loadSignalRegistry,
	parseSignalRegistry,
	SIGNAL_REGISTRY,
} from "../../../src/config/signal-registry";
import REGISTRY_FILE from "../../../src/config/signal-registry.json";

/** A copy of the shipped registry to break one thing at a time. */
function registry(): any {
	return structuredClone(REGISTRY_FILE);
}

const KEY_AUTH = {
	type: "api_key",
	env: "SIGNAL_KEY_FRED",
	in: "query",
	name: "api_key",
};

function sourceOf(file: any, id: string): any {
	return file.sources.find((source: { id: string }) => source.id === id);
}

function assetOf(file: any, id: string): any {
	return file.assets.find((asset: { id: string }) => asset.id === id);
}

describe("signal registry — the shipped file", () => {
	it("loads with test sources of the six dimensions", () => {
		const dimensions = SIGNAL_REGISTRY.sources.flatMap((source) =>
			source.requests.map((request) => request.dimension)
		);

		expect([...new Set(dimensions)].sort()).toEqual([
			"contextual",
			"fundamental",
			"legal",
			"macro",
			"market",
			"social",
		]);
	});

	it("keeps its assets unique and every asset-bound request on a known asset", () => {
		expect(REGISTRY_FILE.assets.length).toBeGreaterThan(0);
		expect(SIGNAL_REGISTRY.assets.size).toBe(REGISTRY_FILE.assets.length);
		for (const source of SIGNAL_REGISTRY.sources) {
			for (const { subject } of source.requests) {
				if ("assetId" in subject) {
					expect(SIGNAL_REGISTRY.assets.has(subject.assetId)).toBe(true);
				}
			}
		}
	});

	it("gives the weather to the whole agriculture sector, not to one asset", () => {
		const weather = SIGNAL_REGISTRY.sources.find(
			(source) => source.id === "nws-kansas-wheat-belt"
		);

		expect(weather?.requests.map((request) => request.subject)).toEqual([
			{ sector: "agriculture" },
		]);
	});

	it("gives the EIA series to the whole energy sector, its key only in the query", () => {
		const eia = SIGNAL_REGISTRY.sources.find(
			(source) => source.id === "eia-weekly-energy"
		);

		expect(eia?.requests.map((request) => request.subject)).toEqual(
			new Array(4).fill({ sector: "energy" })
		);
		expect(eia?.accessPolicy.auth).toMatchObject({
			env: "SIGNAL_KEY_EIA",
			in: "query",
		});
		expect(eia?.accessPolicy.maxRequestsPerDay).toBeDefined();
		expect(SIGNAL_REGISTRY.assets.get("XLE")?.sector).toBe("energy");
	});

	it("freezes no calendar year in a request URL: {year} or a relative window", () => {
		const urls = SIGNAL_REGISTRY.sources.flatMap((s) =>
			s.requests.map((r) => r.url)
		);

		expect(urls.filter((url) => /(?<!\d)20\d\d(?!\d)/.test(url))).toEqual([]);
	});

	it("only holds free sources, Twelve Data alone is non-commercial", () => {
		const policies = SIGNAL_REGISTRY.sources.map((s) => s.accessPolicy);

		expect(
			SIGNAL_REGISTRY.sources
				.filter((s) => s.accessPolicy.terms === "non-commercial")
				.map((s) => s.id)
		).toEqual(["twelvedata-daily-prices"]);
		// A free key is allowed: a source without it is disabled alone.
		expect(
			policies.every(
				(p) => p.auth === "none" || p.auth.env.startsWith("SIGNAL_KEY_")
			)
		).toBe(true);
	});

	it("requests Federal Register counts up to yesterday, one metric per document type", () => {
		const metrics = [
			["NOTICE", "documents_notices"],
			["PRORULE", "documents_proposed_rules"],
			["RULE", "documents_final_rules"],
		];
		const requests = sourceOf(
			registry(),
			"federal-register-documents"
		).requests;
		for (const sector of ["crypto", "technology"]) {
			const mine = requests.filter((r: any) => r.subject.sector === sector);
			const pairs = mine.map((r: any) => [
				/\[type\]\[\]=(\w+)/.exec(r.url)?.[1],
				r.params.metric,
			]);
			expect(pairs.sort()).toEqual(metrics);
		}
		for (const r of requests) {
			expect(r.url).toContain("[publication_date][lte]={date-1}&");
		}
	});
});

describe("parseSignalRegistry", () => {
	it.each([
		["a crypto", "BTC", { assetClass: "crypto", replication: "physical" }],
		["an equity", "AAPL", { assetClass: "equity", replication: "physical" }],
		["a bond", "EA_AAA_10Y", { assetClass: "bond", replication: "physical" }],
		[
			"an etf, class out of the list",
			"GLD",
			{ assetClass: "gold", replication: "physical" },
		],
		[
			"an etf, replication out of the list",
			"GLD",
			{ assetClass: "commodity", replication: "swap" },
		],
	])("refuses exposure on %s", (_name, id, exposure) => {
		const file = registry();
		assetOf(file, id).exposure = exposure;

		expect(() => parseSignalRegistry(file)).toThrow();
	});

	it("refuses exposure on a real estate asset", () => {
		const file = registry();
		Object.assign(assetOf(file, "BTC"), {
			assetType: "real_estate",
			identifier: { scheme: "insee", code: "75056" },
			exposure: { assetClass: "real_estate", replication: "physical" },
		});

		expect(() => parseSignalRegistry(file)).toThrow();
	});

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
				sourceOf(file, "ecb-aaa-yield-10y").requests[0].subject = {
					assetId: "DOGE",
				};
			},
			"source ecb-aaa-yield-10y, request 0: unknown asset DOGE",
		],
		[
			"a request on a sector without asset",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").requests[0].subject = {
					sector: "utilities",
				};
			},
			"source nws-kansas-wheat-belt, request 0: no asset in sector utilities",
		],
		[
			"a request on an area no asset has",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").requests[0].subject = {
					area: "JP",
				};
			},
			"source nws-kansas-wheat-belt, request 0: no asset in area JP",
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
			// Refused by the schema: the Protocol enum only lists protocols with a worker.
			'"protocol"',
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
				sourceOf(file, "sec-edgar-eps-diluted").templates[0].dimension =
					"legal";
			},
			"source sec-edgar-eps-diluted, request 0: legal is not covered by the source or not applicable to its subject",
		],
		[
			"a dimension that does not apply to the asset",
			(file: any) => {
				const pageviews = sourceOf(file, "wikipedia-pageviews");
				pageviews.covers.push({ assetType: "bond", dimension: "social" });
				pageviews.templates[0].select = { assetIds: ["EA_AAA_10Y"] };
			},
			"source wikipedia-pageviews, template 0: social not applicable to asset EA_AAA_10Y",
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
			"a URL placeholder other than {date-N} or {year}",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").requests[0].url =
					"https://data-api.ecb.europa.eu/service/data/YC/{today}";
			},
			"source ecb-aaa-yield-10y, request 0: URL placeholder other than {date-N} or {year}",
		],
		[
			"a maxAgeSeconds shorter than the period of the cron",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").maxAgeSeconds = 600;
			},
			"maxAgeSeconds is shorter than the period of schedule",
		],
	])("refuses %s", (_label, breakIt, message) => {
		const file = registry();
		breakIt(file);

		expect(() => parseSignalRegistry(file)).toThrow(message);
	});

	it("admits a non-commercial source with the clause and the licence status", () => {
		const file = registry();
		Object.assign(sourceOf(file, "nws-kansas-wheat-belt").accessPolicy, {
			terms: "non-commercial",
			restrictions: "personal use only (read 2026-11-15)",
			commercialLicence: "available",
			commercialLicenceUrl: "https://example.com/licence",
		});

		expect(() => parseSignalRegistry(file)).not.toThrow();
	});

	it.each([
		["0 * * * *", 30, 500, true],
		["0 6 * * *", 30, 500, false],
		["7 15 * * 1-5", 30, 30, false],
		["0 * * * *", 30, undefined, false],
	])(
		"checks schedule %s (%i requests) against quota %s",
		(schedule, count, quota, refused) => {
			const file = registry();
			const source = sourceOf(file, "nws-kansas-wheat-belt");
			source.schedule = schedule;
			source.requests = Array.from({ length: count }, () => source.requests[0]);
			source.accessPolicy.maxRequestsPerDay = quota;

			const check = () => parseSignalRegistry(file);
			if (refused) {
				expect(check).toThrow(
					/sends 720 requests a day.*maxRequestsPerDay 500/
				);
			} else {
				expect(check).not.toThrow();
			}
		}
	);

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
			"a selector without criterion",
			(t: any) => {
				t.select = {};
			},
			"selector without criterion",
		],
		[
			"a selector matching nothing",
			(t: any) => {
				t.select = { sector: "utilities" };
			},
			"template 0: selector matches no asset",
		],
		[
			"an unknown asset in the selector",
			(t: any) => {
				t.select = { assetIds: ["BTC", "DOGE"] };
			},
			"template 0: unknown asset DOGE",
		],
		[
			"an unknown hole",
			(t: any) => {
				t.url += "?x={asset.figi}";
			},
			"unknown or misplaced hole",
		],
		[
			"a hole in the host",
			(t: any) => {
				t.url = "https://{asset.alias.wikipedia}.example.org/{date-1}";
			},
			"unknown or misplaced hole",
		],
		[
			"an asset without the alias",
			(t: any) => {
				t.select = { assetIds: ["BTC", "AAPL"] };
			},
			"template 0: asset AAPL has no alias.wikipedia",
		],
		[
			"a dimension not applicable to a selected asset",
			(t: any) => {
				t.select = { sector: "sovereign_debt" };
				t.url = "https://wikimedia.org/{date-1}";
			},
			"template 0: social not applicable to asset EA_AAA_10Y",
		],
	])("refuses a template with %s", (_label, breakIt, message) => {
		const file = registry();
		delete assetOf(file, "AAPL").aliases.wikipedia;
		breakIt(sourceOf(file, "wikipedia-pageviews").templates[0]);

		expect(() => parseSignalRegistry(file)).toThrow(message);
	});

	it("accepts {year} in a template as in a request", () => {
		const file = registry();
		sourceOf(file, "wikipedia-pageviews").templates[0].url += "?y={year}";

		expect(() => parseSignalRegistry(file)).not.toThrow();
	});

	it("reports several template problems together", () => {
		const file = registry();
		delete assetOf(file, "AAPL").aliases.wikipedia;
		const { templates } = sourceOf(file, "wikipedia-pageviews");
		templates.push({ ...templates[0], select: { sector: "utilities" } });
		templates.push({ ...templates[0], select: { assetIds: ["AAPL"] } });

		expect(() => parseSignalRegistry(file)).toThrow(
			/matches no asset; .*asset AAPL has no alias.wikipedia/
		);
	});

	it("unfolds the templates into the former requests, url-encoded", () => {
		const request = (source: string) =>
			SIGNAL_REGISTRY.sources.find((s) => s.id === source)?.requests;
		const wiki = (title: string, assetId: string) => ({
			subject: { assetId },
			dimension: "social",
			url: `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/daily/{date-8}/{date-1}`,
			params: {},
		});

		expect(request("wikipedia-pageviews")).toEqual([
			wiki("Bitcoin", "BTC"),
			wiki("Ethereum", "ETH"),
			wiki("Apple%20Inc.", "AAPL"),
			wiki("Microsoft", "MSFT"),
			wiki("JPMorgan%20Chase", "JPM"),
			wiki("ExxonMobil", "XOM"),
			wiki("Johnson%20%26%20Johnson", "JNJ"),
		]);
		expect(request("sec-edgar-eps-diluted")).toEqual([
			{
				subject: { assetId: "AAPL" },
				dimension: "fundamental",
				url: "https://data.sec.gov/api/xbrl/companyconcept/CIK0000320193/us-gaap/EarningsPerShareDiluted.json",
				params: {},
			},
			{
				subject: { assetId: "MSFT" },
				dimension: "fundamental",
				url: "https://data.sec.gov/api/xbrl/companyconcept/CIK0000789019/us-gaap/EarningsPerShareDiluted.json",
				params: {},
			},
			{
				subject: { assetId: "JPM" },
				dimension: "fundamental",
				url: "https://data.sec.gov/api/xbrl/companyconcept/CIK0000019617/us-gaap/EarningsPerShareDiluted.json",
				params: {},
			},
			{
				subject: { assetId: "XOM" },
				dimension: "fundamental",
				url: "https://data.sec.gov/api/xbrl/companyconcept/CIK0000034088/us-gaap/EarningsPerShareDiluted.json",
				params: {},
			},
			{
				subject: { assetId: "JNJ" },
				dimension: "fundamental",
				url: "https://data.sec.gov/api/xbrl/companyconcept/CIK0000200406/us-gaap/EarningsPerShareDiluted.json",
				params: {},
			},
		]);

		const file = registry();
		assetOf(file, "BTC").aliases.wikipedia = "AC/DC?a b";
		const loaded = parseSignalRegistry(file);
		expect(
			loaded.sources.find((s) => s.id === "wikipedia-pageviews")?.requests[0]
				.url
		).toContain("/user/AC%2FDC%3Fa%20b/daily/");
	});

	it.each([
		[
			"another schema version",
			(file: any) => {
				file.schemaVersion = 2;
			},
			/"schemaVersion"/,
		],
		[
			"a URL in clear",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").requests[0].url =
					"http://api.weather.gov/stations/KHUT/observations/latest";
			},
			/Invalid URL/,
		],
		[
			"a dimension outside the schema (real estate is an asset type)",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").requests[0].dimension =
					"real_estate";
			},
			/"dimension"/,
		],
		[
			"an asset type outside the schema (commodities go through a proxy)",
			(file: any) => {
				assetOf(file, "WHEAT").assetType = "commodity";
			},
			/"assetType"/,
		],
		[
			"an identifier scheme the asset type does not use",
			(file: any) => {
				assetOf(file, "BTC").identifier = {
					scheme: "insee",
					code: "75056",
				};
			},
			/identifier scheme unused/,
		],
		[
			"a dimension listed twice for an asset",
			(file: any) => {
				assetOf(file, "BTC").applicableDimensions.push("market");
			},
			/dimension listed twice/,
		],
		[
			"a request without dimension",
			(file: any) => {
				delete sourceOf(file, "ecb-aaa-yield-10y").requests[0].dimension;
			},
			/"dimension"/,
		],
		[
			"a source that covers nothing",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").covers = [];
			},
			/"covers"/,
		],
		[
			"a reliability above 1",
			(file: any) => {
				sourceOf(file, "wikipedia-pageviews").reliabilityScore = 1.5;
			},
			/reliabilityScore/,
		],
		[
			"a subject naming both an asset and a sector",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").requests[0].subject = {
					assetId: "BTC",
					sector: "crypto",
				};
			},
			/invalid_union/,
		],
		[
			"non-commercial terms without the clause read or the licence status",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").accessPolicy.terms =
					"non-commercial";
			},
			/need the clause read/,
		],
		[
			"non-commercial terms with an available licence but no URL",
			(file: any) => {
				Object.assign(sourceOf(file, "nws-kansas-wheat-belt").accessPolicy, {
					terms: "non-commercial",
					restrictions: "personal use only (read 2026-11-15)",
					commercialLicence: "available",
				});
			},
			/needs its URL/,
		],
		[
			"a commercial licence on free-for-any-use terms",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").accessPolicy.commercialLicence =
					"unknown";
			},
			/only applies to non-commercial/,
		],
		[
			"terms outside the three classes",
			(file: any) => {
				sourceOf(file, "nws-kansas-wheat-belt").accessPolicy.terms = "paid";
			},
			/"terms"/,
		],
		[
			"attribution terms without the credit to give",
			(file: any) => {
				delete sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.attribution;
			},
			/need the credit to give/,
		],
		[
			"a key variable outside SIGNAL_KEY_",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.auth = {
					...KEY_AUTH,
					env: "PATH",
				};
			},
			/must match pattern/,
		],
		[
			"a key variable shared by two sources",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.auth = KEY_AUTH;
				sourceOf(file, "wikipedia-pageviews").accessPolicy.auth = KEY_AUTH;
			},
			/used by two sources/,
		],
		[
			"a source that needs a key",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.auth = "api_key";
			},
			/"auth"/,
		],
		[
			"no request rate",
			(file: any) => {
				sourceOf(file, "ecb-aaa-yield-10y").accessPolicy.maxRequestsPerMinute =
					0;
			},
			/maxRequestsPerMinute/,
		],
		[
			"a source without terms of use",
			(file: any) => {
				delete sourceOf(file, "wikipedia-pageviews").accessPolicy;
			},
			/"accessPolicy"/,
		],
	])("refuses %s (schema)", (_label, breakIt, expected) => {
		const file = registry();
		breakIt(file);

		expect(() => parseSignalRegistry(file)).toThrow(expected);
	});
});

describe("signal registry — freshness threshold", () => {
	it("refuses a schedule it cannot read unless maxAgeSeconds is given", () => {
		const file = registry();
		sourceOf(file, file.sources[0].id).schedule = "0 9 * * mon";

		expect(() => parseSignalRegistry(file)).toThrow(/unreadable/);

		file.sources[0].maxAgeSeconds = 86_400 * 30;

		expect(() => parseSignalRegistry(file)).not.toThrow();
	});
});

describe("signal registry — economic areas", () => {
	it("gives an area request to the assets listing the area, and refuses a signal without or with two subjects", () => {
		const file = registry();
		assetOf(file, "EA_AAA_10Y").areas = ["EA"];
		sourceOf(file, "ecb-aaa-yield-10y").requests[0].subject = { area: "EA" };

		expect(() => parseSignalRegistry(file)).not.toThrow();

		const signal = {
			id: "a".repeat(64),
			schemaVersion: 1,
			sourceId: "ecb-aaa-yield-10y",
			dimension: "legal",
			assetId: null,
			sector: null,
			area: null,
			observedAt: "2026-11-04T12:40:00.000Z",
			ingestedAt: "2026-11-04T13:00:00.000Z",
			confidenceScore: 0.9,
			payload: { metric: "m", value: 1, unit: "u", jurisdiction: "EU" },
		};
		expect(Signal.safeParse({ ...signal, area: "EA" }).success).toBe(true);
		expect(Signal.safeParse(signal).success).toBe(false);
	});
});

describe("signal registry — file outside the image (SIGNAL_REGISTRY_FILE)", () => {
	const write = (content: string) => {
		const path = join(mkdtempSync(join(tmpdir(), "registry-")), "r.json");
		writeFileSync(path, content);
		return path;
	};

	it("reads the mounted file instead of the bundled one", () => {
		const file = registry();
		file.assets.push({ ...assetOf(file, "WHEAT"), id: "MOUNTED" });
		expect(
			loadSignalRegistry(write(JSON.stringify(file))).assets.has("MOUNTED")
		).toBe(true);
	});

	it("keeps the bundled registry when the variable is unset", () => {
		expect(loadSignalRegistry(undefined).assets.has("MOUNTED")).toBe(false);
	});

	it("refuses a mounted file that does not pass the checks", () => {
		const file = registry();
		sourceOf(file, file.sources[0].id).schedule = "not a cron";
		expect(() => loadSignalRegistry(write(JSON.stringify(file)))).toThrow(
			"Invalid signal registry"
		);
		expect(() => loadSignalRegistry(write("{"))).toThrow();
	});
});
