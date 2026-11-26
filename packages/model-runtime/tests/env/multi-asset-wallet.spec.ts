import { describe, expect, test } from "@jest/globals";
import {
	Cash,
	Percentage,
	Price,
	Volume,
} from "@trading-model/primitives/primitives";
import { MultiAssetWallet } from "../../src/env/multi-asset-wallet";
import { createWallet } from "../../src/env/wallet-manager";

const params = {
	initialCash: Cash.of(1000),
	initialPrice: Price.of(50),
	feeRate: Percentage.of(0.001),
	executionCostRate: Percentage.of(0.0005),
	maxExposureFraction: 0.5,
};

describe("MultiAssetWallet", () => {
	test("one asset gives the single-asset wallet results", () => {
		const mono = createWallet(params);
		const multi = new MultiAssetWallet(params, ["A"]);
		const steps: ["buy" | "sell", number, number][] = [
			["buy", 3, 52],
			["buy", 100, 51],
			["sell", 2, 55],
			["sell", 50, 55],
			["buy", 1, 48],
		];
		for (const [side, amount, price] of steps) {
			mono.setPrice(Price.of(price));
			multi.setPrice("A", Price.of(price));
			const v = Volume.of(amount);
			expect(multi[side]("A", v)).toBe(mono[side](v));
		}
		expect(multi.cash).toBe(mono.getCash());
		expect(multi.position("A")).toBe(mono.getPosition());
		expect(multi.valuation()).toBe(mono.getValuation());
		expect(multi.costsPaid).toEqual(mono.getCostsPaid());
	});

	test("assets share one cash balance that never goes negative", () => {
		const w = new MultiAssetWallet(params, ["A", "B"]);
		expect(w.buy("A", Volume.of(10), Price.of(50))).toBe(true);
		expect(w.buy("B", Volume.of(10), Price.of(50))).toBe(false);
		expect(w.cash).toBeGreaterThanOrEqual(0);
		expect(w.position("B")).toBe(0);
		expect(w.valuation()).toBeLessThan(1000);
	});

	test("rejects unknown assets and duplicate lists", () => {
		const w = new MultiAssetWallet(params, ["A"]);
		expect(() => w.position("Z")).toThrow("unknown asset");
		expect(() => new MultiAssetWallet(params, ["A", "A"])).toThrow();
	});
});
