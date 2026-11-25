import { describe, expect, it, jest } from "@jest/globals";
import {
	type BackfillDeps,
	runBackfill,
} from "../../../src/application/signal-backfill";
import {
	SignalCollector,
	signalId,
} from "../../../src/application/signal-collector";
import type { Source } from "../../../src/domain/signals";

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

const SOURCE = {
	id: "s",
	protocol: "rest_api",
	adapter: "a",
	schedule: "0 22 * * *",
	reliabilityScore: 0.5,
	covers: [{ assetType: "equity", dimension: "market" }],
	accessPolicy: {
		terms: "public-domain",
		termsUrl: "https://a.test/t",
		auth: "none",
		maxRequestsPerMinute: 30,
		maxRequestsPerDay: 4,
	},
	history: { url: "https://a.test/{asset.ticker}?{from}&{to}", pageDays: 10 },
	requests: [
		{
			subject: { assetId: "AAPL" },
			dimension: "market",
			url: "https://a.test/AAPL",
			params: {},
		},
	],
} as unknown as Source;
const ASSETS = new Map([
	["AAPL", { id: "AAPL", identifier: { scheme: "ticker", ticker: "AAPL" } }],
]) as unknown as BackfillDeps["registry"]["assets"];

function setup(source: Source, dated = true, failOn?: string) {
	const saved: { id: string }[][] = [];
	const urls: string[] = [];
	const done = new Map<string, string>();
	const sleeps: number[] = [];
	const adapter = {
		dimensions: ["market"],
		normalize: () => [
			{
				key: "2026-01-02",
				observedAt: dated ? Date.parse("2026-01-02T22:00:00Z") : undefined,
				payload: {
					metric: "close",
					value: 1,
					unit: "USD",
					period: { start: "2026-01-02", end: "2026-01-02" },
				},
			},
		],
	};
	const collector = new SignalCollector({
		workers: {
			rest_api: async (request: { url: string }) => {
				if (failOn && request.url.includes(failOn)) {
					throw new Error("boom");
				}
				urls.push(request.url);
				return {};
			},
		},
		adapters: new Map([["a", adapter]]),
		store: {
			save: async (signals: { id: string }[]) => void saved.push(signals),
		},
		now: () => Date.parse("2026-11-01T00:00:00Z"),
		sleep: async () => undefined,
	} as never);
	const errors: string[] = [];
	const deps: BackfillDeps = {
		registry: { assets: ASSETS, sources: [source] },
		collector,
		now: () => Date.parse("2026-11-01T00:00:00Z"),
		sleep: async (ms) => void sleeps.push(ms),
		progress: { get: (k) => done.get(k), set: (k, d) => void done.set(k, d) },
		out: () => undefined,
		err: (text) => void errors.push(text),
	};
	return { deps, saved, urls, sleeps, errors };
}
const ARGS = ["--source", "s", "--from", "2026-01-01", "--to", "2026-01-25"];

describe("signal-backfill", () => {
	it("pages the range, spaced by maxRequestsPerMinute, with ids a normal collection gives", async () => {
		const t = setup(SOURCE);
		expect(await runBackfill(ARGS, t.deps)).toBe(0);
		expect(t.urls).toEqual([
			"https://a.test/AAPL?2026-01-01&2026-01-10",
			"https://a.test/AAPL?2026-01-11&2026-01-20",
			"https://a.test/AAPL?2026-01-21&2026-01-25",
		]);
		expect(t.sleeps).toEqual([2000, 2000]);
		expect(t.saved[0]?.[0]?.id).toBe(
			signalId("s", { assetId: "AAPL" }, "close", "2026-01-02")
		);
	});

	it("refuses a source without history, an undated adapter and bad dates", async () => {
		const { history: _h, ...bare } = SOURCE;
		expect(await runBackfill(ARGS, setup(bare as Source).deps)).toBe(2);
		const undated = setup(SOURCE, false);
		expect(await runBackfill(ARGS, undated.deps)).toBe(1);
		expect(undated.saved).toHaveLength(0);
		for (const range of [
			["2026-02-01", "2026-01-01"],
			["2026-01-01", "2026-12-01"],
			["x", "2026-01-01"],
			["2026-02-31", "2026-03-05"],
		]) {
			const t = setup(SOURCE);
			const args = [
				"--source",
				"s",
				"--from",
				range[0] as string,
				"--to",
				range[1] as string,
			];
			expect(await runBackfill(args, t.deps)).toBe(2);
		}
	});

	it("keeps stored pages on failure and resumes after them", async () => {
		const t = setup(SOURCE, true, "2026-01-11");
		expect(await runBackfill(ARGS, t.deps)).toBe(1);
		expect(t.saved).toHaveLength(1);
		const resumed = setup(SOURCE);
		resumed.deps.progress.set("s:AAPL:2026-01-01:2026-01-25", "2026-01-10");
		await runBackfill(ARGS, resumed.deps);
		expect(resumed.urls[0]).toContain("2026-01-11");
		expect(resumed.urls).toHaveLength(2);
	});

	it("stops at the daily quota left by the normal collection", async () => {
		// quota 4, collection 1 a day: 3 pages fit, a 4th is refused.
		const t = setup(SOURCE);
		const wide = [
			"--source",
			"s",
			"--from",
			"2026-01-01",
			"--to",
			"2026-02-15",
		];
		expect(await runBackfill(wide, t.deps)).toBe(1);
		expect(t.urls).toHaveLength(3);
		expect(t.errors.join()).toContain("quota");
	});

	it("shares the daily quota between two runs of the same day", async () => {
		const t = setup(SOURCE);
		const wide = [
			"--source",
			"s",
			"--from",
			"2026-01-01",
			"--to",
			"2026-02-15",
		];
		await runBackfill(wide, t.deps);
		const urls = t.urls.length;
		expect(await runBackfill(wide, t.deps)).toBe(1);
		expect(t.urls).toHaveLength(urls);
	});
});
