import {
	createDefaultHandlers,
	type DataHandler,
	type DataType,
} from "./data-handlers/data-handler";
import {
	NormalizationStats,
	type SymbolNormalizers,
	type SymbolState,
} from "./market-data-types";

export class NormalizationManager {
	private readonly _handlerMap: Record<DataType, DataHandler>;
	private readonly _handlers: DataHandler[];

	constructor(handlers?: DataHandler[]) {
		this._handlers = handlers ?? createDefaultHandlers();
		this._handlerMap = Object.fromEntries(
			this._handlers.map((handler) => [handler.dataType, handler])
		) as Record<DataType, DataHandler>;
	}

	createNormStats(): SymbolNormalizers {
		const candle = {
			close: new NormalizationStats(),
			volume: new NormalizationStats(),
			open: new NormalizationStats(),
			high: new NormalizationStats(),
			low: new NormalizationStats(),
		};
		const trade = {
			price: new NormalizationStats(),
			qty: new NormalizationStats(),
		};
		const book = {
			bid: new NormalizationStats(),
			ask: new NormalizationStats(),
			spread: new NormalizationStats(),
		};
		const ticker = { volume: new NormalizationStats() };
		return { candle, trade, book, ticker };
	}

	updateNorms(dataType: DataType, state: SymbolState, data: unknown): void {
		this._handlerMap[dataType]?.updateNorms(state, data);
	}
}
