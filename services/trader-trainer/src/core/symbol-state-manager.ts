import {
	createDefaultHandlers,
	type DataHandler,
} from "./data-handlers/data-handler";
import type { DataType } from "./data-handlers/data-types";
import { EvictionPolicy } from "./eviction-policy";
import { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import type { MemoryConfig } from "./memory-config";
import { NormalizationManager } from "./normalization-manager";

export interface SymbolStateManagerConfig extends MemoryConfig {}

export class SymbolStateManager {
	readonly states: Map<TradingSymbol, SymbolState> = new Map();
	private readonly _memoryManager: MemoryManager;
	private readonly _normManager: NormalizationManager;
	private readonly _handlerMap: Record<DataType, DataHandler>;
	private readonly _evictionPolicy: EvictionPolicy;

	constructor(config: SymbolStateManagerConfig, handlers?: DataHandler[]) {
		this._evictionPolicy = config.evictionPolicy;
		this._memoryManager = new MemoryManager({
			maxSize: config.maxSize,
			maxMemoryBytes: config.maxMemoryBytes,
			evictionPolicy: config.evictionPolicy,
		});
		this._normManager = new NormalizationManager(handlers);
		const defaultHandlers = handlers ?? createDefaultHandlers();
		this._handlerMap = Object.fromEntries(
			defaultHandlers.map((handler) => [handler.dataType, handler])
		) as Record<DataType, DataHandler>;
	}

	getMemoryManager(): MemoryManager {
		return this._memoryManager;
	}

	getMaxSize(): number {
		return this._memoryManager.getMaxSize();
	}

	_getOrCreate(symbol: TradingSymbol): SymbolState {
		let state = this.states.get(symbol);
		if (!state) {
			state = this._createSymbolState();
			this.states.set(symbol, state);
		}
		this._memoryManager.recordAccess(symbol);
		return state;
	}

	_getState(symbol: TradingSymbol): SymbolState {
		return this._getOrCreate(symbol);
	}

	private _createSymbolState(): SymbolState {
		return {
			candles: [],
			trades: [],
			norm: this._normManager.createNormStats(),
		};
	}

	addData(
		dataType: import("./data-handlers/data-handler").DataType,
		symbol: TradingSymbol,
		data: unknown
	): void {
		const maxSize = this._memoryManager.getMaxSize();
		const state = this._getOrCreate(symbol);
		const handler = this._handlerMap[dataType];
		if (!handler) {
			return;
		}
		handler.mutateState({ symbol, data, state, maxSize });
		this._normManager.updateNorms(dataType, state, data);
		this._evictIfNeeded();
	}

	private _evictIfNeeded(): void {
		if (this._evictionPolicy !== EvictionPolicy.Lru) {
			return;
		}
		const total = this._computeTotalBytes();
		const victims = this._memoryManager.enforceMemoryLimit(total, (sym) =>
			this._estimateMemoryBytes(this.states.get(sym))
		);
		for (const val of victims) {
			this.states.delete(val);
		}
	}

	private _computeTotalBytes(): number {
		let total = 0;
		for (const state of this.states.values()) {
			total += this._estimateMemoryBytes(state);
		}
		return total;
	}

	private _estimateMemoryBytes(state?: SymbolState): number {
		if (!state) {
			return 0;
		}
		const candleBytes = state.candles.length * 200;
		const tradeBytes = state.trades.length * 100;
		const orderBookBytes = state.orderBook ? 5000 : 0;
		return candleBytes + tradeBytes + orderBookBytes;
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
