import { describe, expect, it } from "@jest/globals";
import {
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import { z } from "zod";
import {
	BaseMarketDataShape,
	OhlcvShape,
} from "../../../src/shared/schemas/market-data-schema";

const BASE = {
	symbol: "BTCUSDT",
	timestamp: 1_700_000_000_000,
	source: SourceType.values()[0],
	market: MarketType.values()[0],
};

describe("market-data-schema", () => {
	it.each([
		["BaseMarketDataShape", BaseMarketDataShape, BASE],
		[
			"OhlcvShape",
			OhlcvShape,
			{ low: 1, open: 2, high: 3, close: 2, volume: 10 },
		],
	] as const)(
		"%s should accept a complete record and refuse one missing a field",
		(_name, shape, valid) => {
			const schema = z.object(shape);
			expect(schema.safeParse(valid).success).toBe(true);
			for (const key of Object.keys(valid)) {
				const { [key]: _dropped, ...partial } = valid as Record<
					string,
					unknown
				>;
				expect(schema.safeParse(partial).success).toBe(false);
			}
		}
	);

	it("should refuse an unknown source or market", () => {
		const schema = z.object(BaseMarketDataShape);
		expect(schema.safeParse({ ...BASE, source: "nope" }).success).toBe(false);
		expect(schema.safeParse({ ...BASE, market: "nope" }).success).toBe(false);
	});
});
