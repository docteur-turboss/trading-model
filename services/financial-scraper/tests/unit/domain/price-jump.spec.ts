import { dropPriceJumps } from "../../../src/domain/price-jump";

const series = (closes: number[]) =>
	closes.map((close, i) => ({ close, timestamp: i })) as never[];
const base = (n: number) =>
	Array.from({ length: n }, (_, i) => 60_000 + (i % 2 ? 40 : -40));

describe("dropPriceJumps", () => {
	it("drops an isolated x10 tick and keeps its neighbours", () => {
		const closes = base(100);
		closes[50] = 600_000;
		const { kept, dropped } = dropPriceJumps(series(closes));
		expect(dropped).toHaveLength(1);
		expect(dropped[0]).toMatchObject({ close: 600_000 });
		expect(kept).toHaveLength(99);
	});

	it("drops an aberrant first candle without rejecting the rest", () => {
		const closes = base(10);
		closes[0] = 600_000;
		expect(dropPriceJumps(series(closes)).dropped).toHaveLength(1);
	});

	it("keeps a real 5 % one-candle move", () => {
		const closes = [...base(50), 63_000, 63_100];
		expect(dropPriceJumps(series(closes)).dropped).toEqual([]);
	});

	it.each([[[]], [[600_000]]])("rejects nothing from %j", (closes) => {
		const { kept, dropped } = dropPriceJumps(series(closes));
		expect(kept).toHaveLength(closes.length);
		expect(dropped).toEqual([]);
	});
});
