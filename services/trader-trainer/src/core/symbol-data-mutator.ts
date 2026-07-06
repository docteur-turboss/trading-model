import type { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import type { NormalizationManager } from "./normalization-manager";
import { createDefaultHandlers, type DataHandler } from "./data-handlers/data-handler";

export class SymbolDataMutator {
	private readonly _handlerMap: Record<string, DataHandler>;

	constructor(
		private readonly _memoryManager: MemoryManager,
		private readonly _normManager: NormalizationManager,
		handlers?: DataHandler[],
	) {
		const h = handlers ?? createDefaultHandlers();
		this._handlerMap = Object.fromEntries(h.map((x) => [x.dataType, x]));
	}

	mutateData(
		dataType: string,
		symbol: TradingSymbol,
		data: unknown,
		states: Map<TradingSymbol, SymbolState>,
		maxSize?: number,
	): void {
		const state = states.get(symbol);
		if (!state) return;
		const handler = this._handlerMap[dataType];
		if (!handler) return;
		handler.mutateState(symbol, data, state, maxSize);
		this._normManager.updateNorms(dataType, state, data);
		this._memoryManager.enforceMemoryLimit();
	}
}
