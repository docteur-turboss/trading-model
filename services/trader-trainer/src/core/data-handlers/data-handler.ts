import type {
	BaseSymbolState,
	SymbolNormalizers,
	SymbolState,
} from "../market-data-types";
import { bookTickerHandler } from "./book-ticker-handler";
import { candleHandler } from "./candle-handler";
import { DataType } from "./data-types";
import { orderBookHandler } from "./order-book-handler";
import { tickerHandler } from "./ticker-handler";
import { tradeHandler } from "./trade-handler";

export { DataType };

export interface MutateStateContext<TData = unknown> {
	symbol: import("../market-data-types").TradingSymbol;
	data: TData;
	state: SymbolState;
	maxSize?: number;
}

export interface DataHandler<TData = unknown> {
	readonly dataType: DataType;
	updateNorms(state: SymbolState, data: TData): void;
	mutateState(ctx: MutateStateContext<TData>): void;
	serializeNorms(state: SymbolState): Record<string, unknown>;
	estimateMemoryBytes(state: SymbolState): number;
	createState(): Partial<BaseSymbolState>;
	createNorms(): Partial<SymbolNormalizers>;
}

export function pushWithMaxSize<TData>(
	array: TData[],
	data: TData,
	maxSize?: number
): TData[] {
	array.push(data);
	if (maxSize !== undefined && array.length > maxSize) {
		return array.slice(-maxSize);
	}
	return array;
}

export function serializeAllNorms(
	state: SymbolState,
	handlers?: DataHandler[]
): Record<string, unknown> {
	const all = (handlers ?? createDefaultHandlers()).reduce(
		(acc, handler) => Object.assign(acc, handler.serializeNorms(state)),
		{} as Record<string, unknown>
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
