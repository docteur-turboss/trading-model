import type { SymbolState } from "../market-data-types";
import type { NormalizationStats } from "../normalization-stats";
import { bookTickerHandler } from "./book-ticker-handler";
import { candleHandler } from "./candle-handler";
import { DataType } from "./data-types";
import { orderBookHandler } from "./order-book-handler";
import { tickerHandler } from "./ticker-handler";
import { tradeHandler } from "./trade-handler";

export { DataType };

export interface DataHandler<TData = unknown> {
	readonly dataType: DataType;
	updateNorms(state: SymbolState, data: TData): void;
	mutateState(
		symbol: import("../market-data-types").TradingSymbol,
		data: TData,
		state: SymbolState,
		maxSize?: number
	): void;
	serializeNorms(
		state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>>;
}

export function serializeAllNorms(
	state: SymbolState,
	handlers?: DataHandler[]
): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
	const all = (handlers ?? createDefaultHandlers()).reduce(
		(acc, handler) => Object.assign(acc, handler.serializeNorms(state)),
		{} as Record<string, ReturnType<NormalizationStats["toJSON"]>>
	);
	return all;
}

export function createDefaultHandlers(): DataHandler[] {
	return [
		candleHandler,
		tradeHandler,
		orderBookHandler,
		bookTickerHandler,
		tickerHandler,
	];
}
