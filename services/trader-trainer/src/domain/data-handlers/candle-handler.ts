import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	createCandleNorms,
	isConsistentCandle,
	updateCandleNorms,
} from "@trading-model/model-runtime/features/feature-builder";
import type { SymbolNormalizers, SymbolState } from "../market-data-types";
import { isAfterLast, pushWithMaxSize } from "./data-handler-utils";

export const candleHandler = {
	createState(): Pick<SymbolState, "candles"> {
		return { candles: [] };
	},
	createNorms(): SymbolNormalizers {
		return { candle: createCandleNorms() };
	},
	/** Also replays history into fresh statistics (point in time, ADR-0030). */
	updateNorms(state: Pick<SymbolState, "norm">, candle: CandleData): void {
		updateCandleNorms(state.norm.candle, candle);
	},
	/** False when `candle` repeats one the state holds: normalizers must not count it twice. */
	isNew(state: SymbolState, candle: CandleData): boolean {
		return (
			isConsistentCandle(candle) &&
			isAfterLast(state.candles, candle, "timestamp")
		);
	},
	mutateState(state: SymbolState, data: CandleData, maxSize?: number): void {
		if (!isConsistentCandle(data)) {
			return;
		}
		// The scraper re-sends candles it already published (overlapping fetch
		// windows, retries): keep the series strictly increasing in time, or the
		// same candle lands in both the training and the validation windows.
		if (isAfterLast(state.candles, data, "timestamp")) {
			state.candles = pushWithMaxSize(state.candles, data, maxSize);
		} else if (
			state.candles[state.candles.length - 1]?.timestamp === data.timestamp
		) {
			// A later version of the last candle (it was still open) supersedes it.
			state.candles[state.candles.length - 1] = data;
		}
	},
	estimateMemoryBytes(state: SymbolState): number {
		return state.candles.length * 200;
	},
	serializeNorms(state: SymbolState): Record<string, unknown> {
		return {
			candle: {
				close: state.norm.candle.close.toJSON(),
				volume: state.norm.candle.volume.toJSON(),
				open: state.norm.candle.open.toJSON(),
				high: state.norm.candle.high.toJSON(),
				low: state.norm.candle.low.toJSON(),
			},
		};
	},
};
