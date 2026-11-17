import { barsPerYear, buyAndHoldSharpe } from "../src/replay-metrics";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

/** Weekday bars from Monday 2026-01-05; prices step +1, +3, +1, +3... */
function weekdayBars(count: number, skip: number[] = []) {
	const bars: { price: number; timestamp: number }[] = [];
	let price = 100;
	for (let d = 0; bars.length < count + skip.length; d++) {
		const timestamp = Date.parse("2026-01-05T00:00:00Z") + d * DAY;
		if (![0, 6].includes(new Date(timestamp).getUTCDay())) {
			price += bars.length % 2 === 0 ? 1 : 3;
			bars.push({ price, timestamp });
		}
	}
	return bars.filter((_bar, idx) => !skip.includes(idx));
}

describe("daily bars", () => {
	it("annualise a known Sharpe with the bars a year really has, not 365", () => {
		// 29 bars, 28 steps of +3,+1,...: mean 2, sample std sqrt(28 / 27).
		const bars = weekdayBars(29);
		const spanDays = (bars[28].timestamp - bars[0].timestamp) / DAY;
		const perYear = (YEAR / DAY) * (28 / spanDays);
		expect(barsPerYear(bars)).toBeCloseTo(perYear);
		expect(perYear).toBeGreaterThan(255);
		expect(perYear).toBeLessThan(270);
		const sharpe = (2 / Math.sqrt(28 / 27)) * Math.sqrt(perYear);
		expect(buyAndHoldSharpe([bars])).toBeCloseTo(sharpe);
	});

	it("count fewer bars a year over a series with a hole (dropped day), as the bars are further apart", () => {
		const full = barsPerYear(weekdayBars(29)) as number;
		const hole = barsPerYear(weekdayBars(28, [10])) as number;
		expect(hole).toBeLessThan(full);
		expect(hole).toBeGreaterThan(250);
	});
});
