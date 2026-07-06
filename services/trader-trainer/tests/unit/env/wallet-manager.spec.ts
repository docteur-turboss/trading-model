import { describe, expect, test } from "@jest/globals";
import { createWallet } from "../../../src/core/env/wallet-manager";
import { Cash, Price, Volume, Percentage } from "@trading-model/common/domain/primitives";

describe("Wallet module", () => {
	describe("Initialization", () => {
		test("should create wallet with valid initial values", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			expect(wallet.getCash()).toBe(1000);
			expect(wallet.getPrice()).toBe(50);
			expect(wallet.getPosition()).toBe(0);
			expect(wallet.getValuation()).toBe(1000);
		});

		test("should throw error for invalid initial cash", () => {
			expect(() => Cash.of(-10)).toThrow("Cash must be a non-negative finite number");
			expect(() => Cash.of(Number.NaN)).toThrow("Cash must be a non-negative finite number");
		});

		test("should throw error for invalid initial price", () => {
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(0) })
).toThrow("Invalid initialPrice: 0");
		expect(() =>
			createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(-5) })
		).toThrow("Price must be a non-negative finite number, got -5");
		});

		test("should throw error for invalid feeRate (>=1)", () => {
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), feeRate: Percentage.of(1) })
			).toThrow("Invalid feeRate");
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), feeRate: Percentage.of(-0.1) })
			).toThrow("Invalid feeRate");
			expect(() =>
				createWallet({
					initialCash: Cash.of(1000),
					initialPrice: Price.of(50),
					feeRate: Percentage.of(Number.NaN),
				})
			).toThrow("Percentage must be a finite number");
		});

		test("should throw error for invalid maxPosition", () => {
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), maxPosition: Volume.of(0) })
			).toThrow("Invalid maxPosition");
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), maxPosition: Volume.of(-1) })
			).toThrow("Volume must be a non-negative finite number");
		});

		test("should throw error for invalid decimals", () => {
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), decimals: 0 })
			).toThrow("Invalid decimals");
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), decimals: 16 })
			).toThrow("Invalid decimals");
			expect(() =>
				createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50), decimals: 2.5 })
			).toThrow("Invalid decimals");
		});

		test("should create wallet with valid decimals", () => {
			const wallet = createWallet({
				initialCash: Cash.of(1000),
				initialPrice: Price.of(50),
				decimals: 4,
			});
			expect(wallet.getCash()).toBe(1000);
			expect(wallet.getPosition()).toBe(0);
		});

		test("should create wallet with valid feeRate and maxPosition", () => {
			const wallet = createWallet({
				initialCash: Cash.of(1000),
				initialPrice: Price.of(50),
				feeRate: Percentage.of(0.001),
				maxPosition: Volume.of(100),
			});
			expect(wallet.getCash()).toBe(1000);
			expect(wallet.getPosition()).toBe(0);
		});
	});

	describe("Buying behavior", () => {
		test("should buy successfully if enough cash", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			const result = wallet.buy(Volume.of(5));
			expect(result).toBe(true);
			expect(wallet.getPosition()).toBe(5);
			expect(wallet.getCash()).toBe(750);
			expect(wallet.getValuation()).toBe(1000);
		});

		test("should fail to buy if insufficient cash", () => {
			const wallet = createWallet({ initialCash: Cash.of(100), initialPrice: Price.of(50) });
			const result = wallet.buy(Volume.of(3));
			expect(result).toBe(false);
			expect(wallet.getPosition()).toBe(0);
			expect(wallet.getCash()).toBe(100);
		});

		test("should fail to buy with invalid amount (zero or negative)", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			expect(wallet.buy(Volume.of(0))).toBe(false);
			expect(() => wallet.buy(Volume.of(-2))).toThrow();
		});

		test("should fail to buy when exceeding maxPosition", () => {
			const wallet = createWallet({
				initialCash: Cash.of(1000),
				initialPrice: Price.of(50),
				maxPosition: Volume.of(10),
			});
			wallet.buy(Volume.of(10));
			expect(wallet.buy(Volume.of(1))).toBe(false);
		});
	});

	describe("Selling behavior", () => {
		test("should sell successfully when enough position", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(5));
			const result = wallet.sell(Volume.of(2));
			expect(result).toBe(true);
			expect(wallet.getPosition()).toBe(3);
			expect(wallet.getCash()).toBe(1000 - 5 * 50 + 2 * 50);
			expect(wallet.getValuation()).toBe(850 + 3 * 50);
		});

		test("should fail to sell more than current position", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(2));
			const result = wallet.sell(Volume.of(5));
			expect(result).toBe(false);
			expect(wallet.getPosition()).toBe(2);
		});

		test("should fail to sell invalid amount (zero or negative)", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(3));
			expect(wallet.sell(Volume.of(0))).toBe(false);
			expect(() => wallet.sell(Volume.of(-1))).toThrow();
		});
	});

	describe("Price management", () => {
		test("should update price correctly", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.setPrice(Price.of(75));
			expect(wallet.getPrice()).toBe(75);
		});

		test("should throw for invalid price updates (negative or non-numeric)", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			expect(() => wallet.setPrice(Price.of(-10))).toThrow();
			expect(wallet.getPrice()).toBe(50);
			expect(() => wallet.setPrice(Price.of(Number.NaN))).toThrow();
			expect(wallet.getPrice()).toBe(50);
		});
	});

	describe("Valuation and state tracking", () => {
		test("should calculate valuation correctly after buy/sell/price changes", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(5));
			wallet.sell(Volume.of(2));
			wallet.setPrice(Price.of(60));
			expect(wallet.getValuation()).toBeCloseTo(850 + 3 * 60);
		});

		test("should remain consistent across multiple operations", () => {
			const wallet = createWallet({ initialCash: Cash.of(500), initialPrice: Price.of(20) });
			wallet.buy(Volume.of(10));
			wallet.setPrice(Price.of(25));
			wallet.sell(Volume.of(4));
			expect(wallet.getPosition()).toBe(6);
			expect(wallet.getCash()).toBe(400);
			expect(wallet.getValuation()).toBe(400 + 6 * 25);
		});
	});

	describe("Fee behavior", () => {
		test("should apply feeRate on buy", () => {
			const wallet = createWallet({
				initialCash: Cash.of(1000),
				initialPrice: Price.of(50),
				feeRate: Percentage.of(0.01),
			});
			wallet.buy(Volume.of(5));
			const baseCost = 5 * 50;
			const fee = Math.round(baseCost * 0.01 * 1e8) / 1e8;
			expect(wallet.getCash()).toBeCloseTo(1000 - baseCost - fee, 6);
		});

		test("should apply feeRate on sell", () => {
			const wallet = createWallet({
				initialCash: Cash.of(1000),
				initialPrice: Price.of(50),
				feeRate: Percentage.of(0.01),
			});
			wallet.buy(Volume.of(10));
			const cashAfterBuy = wallet.getCash();
			wallet.sell(Volume.of(5));
			const baseProceeds = 5 * 50;
			const fee = Math.round(baseProceeds * 0.01 * 1e8) / 1e8;
			expect(wallet.getCash()).toBeCloseTo(
				cashAfterBuy + baseProceeds - fee,
				6
			);
		});

		test("should track totalFeesPaid in metrics", () => {
			const wallet = createWallet({
				initialCash: Cash.of(1000),
				initialPrice: Price.of(50),
				feeRate: Percentage.of(0.01),
			});
			wallet.buy(Volume.of(5));
			wallet.sell(Volume.of(3));
			const metrics = wallet.getMetrics();
			expect(metrics.totalFeesPaid).toBeGreaterThan(0);
		});
	});

	describe("PnL and Metrics", () => {
		test("should return 0 PnL when no trades", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			expect(wallet.getPnL()).toBe(0);
		});

		test("should return positive PnL after profitable price increase", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(10));
			wallet.setPrice(Price.of(60));
			expect(wallet.getPnL()).toBeGreaterThan(0);
		});

		test("should track drawdown in metrics", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(10));
			wallet.setPrice(Price.of(70));
			wallet.setPrice(Price.of(30));
			const metrics = wallet.getMetrics();
			expect(metrics.drawdown).toBeGreaterThan(0);
		});

		test("should track tradeCount in metrics", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(5));
			wallet.sell(Volume.of(2));
			const metrics = wallet.getMetrics();
			expect(metrics.tradeCount).toBe(2);
		});

		test("should compute returnRate in metrics", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(10));
			wallet.setPrice(Price.of(60));
			const metrics = wallet.getMetrics();
			// valuation = (1000 - 10*50) + 10*60 = 1100, returnRate = (1100-1000)/1000 = 0.1
			expect(metrics.returnRate).toBeCloseTo(0.1, 5);
		});

		test("should handle zero cash in metrics drawdown", () => {
			const wallet = createWallet({ initialCash: Cash.of(0), initialPrice: Price.of(50) });
			const metrics = wallet.getMetrics();
			expect(metrics.drawdown).toBe(0);
			expect(metrics.pnl).toBe(0);
			expect(metrics.returnRate).toBeNaN();
		});
	});

	describe("Reset", () => {
		test("should reset wallet to initial state", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(5));
			wallet.setPrice(Price.of(60));
			wallet.sell(Volume.of(2));

			wallet.reset();

			expect(wallet.getCash()).toBe(1000);
			expect(wallet.getPosition()).toBe(0);
			expect(wallet.getPrice()).toBe(50);
			expect(wallet.getValuation()).toBe(1000);
			expect(wallet.getPnL()).toBe(0);
			expect(wallet.getHistory()).toEqual([]);
		});
	});

	describe("getHistory", () => {
		test("should record trade history", () => {
			const wallet = createWallet({ initialCash: Cash.of(1000), initialPrice: Price.of(50) });
			wallet.buy(Volume.of(5));
			wallet.sell(Volume.of(2));
			const history = wallet.getHistory();
			expect(history.length).toBe(2);
			expect(history[0].action).toBe("buy");
			expect(history[1].action).toBe("sell");
		});
	});
});
