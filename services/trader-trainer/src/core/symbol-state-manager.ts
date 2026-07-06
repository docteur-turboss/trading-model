import { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import { NormalizationManager } from "./normalization-manager";
import { SymbolDataMutator } from "./symbol-data-mutator";
import { SymbolStateAccessor } from "./symbol-state-accessor";

export class SymbolStateManager {
	readonly states: Map<TradingSymbol, SymbolState> = new Map();
	readonly accessOrder: TradingSymbol[] = [];
	private readonly _memoryManager: MemoryManager;
	private readonly _normManager: NormalizationManager;
	private readonly _dataMutator: SymbolDataMutator;
	private readonly _stateAccessor: SymbolStateAccessor;

	constructor(
		maxSize: number,
		maxMemoryBytes: number,
		evictionPolicy: "LRU" | "none"
	) {
		this._memoryManager = new MemoryManager({
			states: this.states,
			accessOrder: this.accessOrder,
			maxSize,
			maxMemoryBytes,
			evictionPolicy,
		});
		this._normManager = new NormalizationManager();
		this._dataMutator = new SymbolDataMutator(
			this._memoryManager,
			this._normManager
		);
		this._stateAccessor = new SymbolStateAccessor(
			this._normManager,
			this._memoryManager
		);
	}

	getMemoryManager(): MemoryManager {
		return this._memoryManager;
	}

	getMaxSize(): number {
		return this._memoryManager.getMaxSize();
	}

	_getOrCreate(symbol: TradingSymbol): SymbolState {
		return this._stateAccessor.getOrCreate(symbol, this.states);
	}

	_getState(symbol: TradingSymbol): SymbolState {
		return this._stateAccessor.getState(symbol, this.states);
	}

	addData(dataType: string, symbol: TradingSymbol, data: unknown): void {
		const maxSize = this._memoryManager.getMaxSize();
		this._dataMutator.mutateData(dataType, symbol, data, this.states, maxSize);
	}

	getSymbols(): TradingSymbol[] {
		return Array.from(this.states.keys());
	}

	getSymbolState(symbol: TradingSymbol): SymbolState | undefined {
		const state = this.states.get(symbol);
		if (!state) {
			return;
		}
		return { ...state };
	}

	restoreSymbolState(symbol: TradingSymbol, state: SymbolState): void {
		this.states.set(symbol, state);
	}

	getCandleCount(symbol: TradingSymbol): number {
		return this.states.get(symbol)?.candles.length ?? 0;
	}
}
