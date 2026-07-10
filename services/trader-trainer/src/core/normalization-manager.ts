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

	constructor(handlers?: DataHandler[]) {
		const defaultHandlers = handlers ?? createDefaultHandlers();
		this._handlerMap = Object.fromEntries(
			defaultHandlers.map((handler) => [handler.dataType, handler])
		) as Record<DataType, DataHandler>;
	}

	createNormStats(): SymbolNormalizers {
		return {
			candle: {
				close: new NormalizationStats(),
				volume: new NormalizationStats(),
				open: new NormalizationStats(),
				high: new NormalizationStats(),
				low: new NormalizationStats(),
			},
			trade: {
				price: new NormalizationStats(),
				qty: new NormalizationStats(),
			},
			book: {
				bid: new NormalizationStats(),
				ask: new NormalizationStats(),
				spread: new NormalizationStats(),
			},
			ticker: {
				volume: new NormalizationStats(),
			},
		};
	}

	updateNorms(dataType: DataType, state: SymbolState, data: unknown): void {
		this._handlerMap[dataType]?.updateNorms(state, data);
	}
}
