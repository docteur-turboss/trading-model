import {
	createDefaultHandlers,
	type DataHandler,
} from "./data-handlers/data-handler";
import {
	NormalizationStats,
	type SymbolNormalizers,
	type SymbolState,
} from "./market-data-types";

export class NormalizationManager {
	private readonly _handlerMap: Record<string, DataHandler>;

	constructor(handlers?: DataHandler[]) {
		const h = handlers ?? createDefaultHandlers();
		this._handlerMap = Object.fromEntries(h.map((x) => [x.dataType, x]));
	}

	createNormStats(): SymbolNormalizers {
		return {
			candleClose: new NormalizationStats(),
			candleVolume: new NormalizationStats(),
			candleOpen: new NormalizationStats(),
			candleHigh: new NormalizationStats(),
			candleLow: new NormalizationStats(),
			tradePrice: new NormalizationStats(),
			tradeQty: new NormalizationStats(),
			bid: new NormalizationStats(),
			ask: new NormalizationStats(),
			spread: new NormalizationStats(),
			tickerVolume: new NormalizationStats(),
		};
	}

	updateNorms(dataType: string, state: SymbolState, data: unknown): void {
		this._handlerMap[dataType]?.updateNorms(state, data);
	}
}
