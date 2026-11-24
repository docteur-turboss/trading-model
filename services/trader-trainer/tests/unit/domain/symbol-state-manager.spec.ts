import {
	Price,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { EvictionPolicy } from "../../../src/domain/eviction-policy";
import { SymbolStateManager } from "../../../src/domain/symbol-state-manager";
import { makeCandle } from "../../fixtures/market-data.fixture";

const SYMBOL = TradingSymbol.of("BTCUSDT");
const T0 = 1_700_000_000_000;

describe("SymbolStateManager norms", () => {
	it("counts a replaced open candle once", () => {
		const manager = new SymbolStateManager({
			maxSize: 10,
			maxMemoryBytes: 1_000_000,
			evictionPolicy: EvictionPolicy.None,
		});
		const timestamp = UnixTimestamp.of(T0);
		manager.addCandle(SYMBOL, makeCandle({ symbol: SYMBOL, timestamp }));
		manager.addCandle(
			SYMBOL,
			makeCandle({ symbol: SYMBOL, timestamp, close: Price.of(101) })
		);

		const state = manager.states.get(SYMBOL);
		expect(state?.candles).toHaveLength(1);
		expect(state?.norm.candle.close.toJSON().count).toBe(1);
	});
});
