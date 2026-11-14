import type {
	BaseSymbolState,
	SymbolNormalizers,
	SymbolState,
	TradingSymbol,
} from "../market-data-types";
import { bookTickerHandler } from "./book-ticker-handler";
import { candleHandler } from "./candle-handler";
import type { DataType } from "./data-types";
import { orderBookHandler } from "./order-book-handler";
import { priceHandler } from "./price-handler";
import { tickerHandler } from "./ticker-handler";
import { tradeHandler } from "./trade-handler";

interface MutateStateContext<TData = unknown> {
	symbol: TradingSymbol;
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
