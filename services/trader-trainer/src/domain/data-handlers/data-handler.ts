import type {
	BaseSymbolState,
	SymbolNormalizers,
	SymbolState,
} from "../market-data-types";
import { bookTickerHandler } from "./book-ticker-handler";
import { candleHandler } from "./candle-handler";
import type { DataType } from "./data-types";
import { orderBookHandler } from "./order-book-handler";
import { priceHandler } from "./price-handler";
import { tickerHandler } from "./ticker-handler";
import { tradeHandler } from "./trade-handler";

interface MutateStateContext<TData = unknown> {
	symbol: import("../market-data-types").TradingSymbol;
	data: TData;
	state: SymbolState;
	maxSize?: number;
}

export interface DataHandler<TData = unknown> {
	readonly dataType: DataType;
	/** Also replays history into fresh statistics (point in time, ADR-0030). */
	updateNorms(state: Pick<SymbolState, "norm">, data: TData): void;
	/**
	 * False when `data` repeats something the state already holds: the state
	 * may still be updated, but the normalizers must not count it twice.
	 * Absent means every item is new.
	 */
	isNew?(state: SymbolState, data: TData): boolean;
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
		// In place: a full series receives one message at a time, no full copy per message.
		array.splice(0, array.length - maxSize);
	}
	return array;
}

/** True when `item` comes after the last item of a series kept in time order. */
export function isAfterLast<TData extends object, TKey extends keyof TData>(
	series: readonly TData[],
	item: Pick<TData, TKey>,
	key: TKey
): boolean {
	const last = series[series.length - 1] as TData | undefined;
	return last === undefined || item[key] > last[key];
}

export function createDefaultHandlers(): DataHandler[] {
	return [
		candleHandler,
		tradeHandler,
		orderBookHandler,
		bookTickerHandler,
		tickerHandler,
		priceHandler,
	];
}
