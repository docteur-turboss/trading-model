import type { Signal } from "@trading-model/contracts/wire/signals";
import { toSymbol } from "@trading-model/primitives/primitives";
import { SignalBarHistory } from "../../../src/signals/signal-bar-history";

const AT = Date.parse("2026-03-20T00:00:00Z");

function signal(
	day: string,
	metric: string,
	value: number,
	observedAt = `${day}T22:00:00Z`
): Signal {
	return {
		assetId: "AAPL",
		dimension: "market",
		observedAt,
		payload: { metric, value, period: { start: day, end: day } },
	} as unknown as Signal;
}

function day(date: string, close: number, skip: string[] = []): Signal[] {
	const metrics = {
		open: close,
		high: close + 1,
		low: close - 1,
		close,
		volume: 10,
	};
	return Object.entries(metrics)
		.filter(([metric]) => !skip.includes(metric))
		.map(([metric, value]) => signal(date, metric, value));
}

const issues: string[] = [];

function history(signals: Signal[]): SignalBarHistory {
	return new SignalBarHistory(
		{
			loadWindow: async (_asset, _from, to) =>
				signals.filter((s) => Date.parse(s.observedAt) <= to),
		},
		new Map([[toSymbol("AAPL"), "equity"]]),
		(symbol, issue) => issues.push(`${symbol}:${issue}`)
	);
}

describe("SignalBarHistory", () => {
	const aapl = toSymbol("AAPL");

	it("rebuilds one daily bar per complete day and drops an incomplete one", async () => {
		const bars = await history([
			...day("2026-03-16", 100),
			...day("2026-03-17", 101, ["volume"]),
			...day("2026-03-18", 102),
		]).loadWindow(aapl, AT, 10);
		expect(bars.map((bar) => bar.close)).toEqual([100, 102]);
		expect(bars[0].closeTimestamp).toBe(Date.parse("2026-03-17T00:00:00Z") - 1);
	});

	it("reads nothing observed after the session instant", async () => {
		const bars = await history([
			...day("2026-03-16", 100),
			...day("2026-03-19", 105),
		]).loadWindow(aapl, Date.parse("2026-03-17T00:00:00Z"), 10);
		expect(bars.map((bar) => bar.close)).toEqual([100]);
	});

	it("scales a day's prices to its adjusted close", async () => {
		const [bar] = await history([
			...day("2026-03-16", 100),
			signal("2026-03-16", "adjusted_close", 50),
		]).loadWindow(aapl, AT, 10);
		expect([bar.open, bar.close, bar.volume]).toEqual([50, 50, 10]);
	});

	it("counts a split-like jump and an incomplete day once per day, however often they are read", async () => {
		issues.length = 0;
		const source = history([
			...day("2026-03-16", 400),
			...day("2026-03-17", 100),
			...day("2026-03-18", 101, ["volume"]),
		]);
		for (let cycle = 0; cycle < 3; cycle++) {
			const bars = await source.loadWindow(aapl, AT, 10);
			expect(bars.map((bar) => bar.close)).toEqual([400, 100]);
		}
		expect(issues).toEqual(["AAPL:split_suspect", "AAPL:incomplete_day"]);
	});
});
