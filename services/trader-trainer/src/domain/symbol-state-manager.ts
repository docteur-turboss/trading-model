import type { CandleData } from "@trading-model/contracts/market-data.types";
import { isConsistentCandle } from "@trading-model/model-runtime/features/feature-builder";
import { candleHandler } from "./data-handlers/candle-handler";
import { DataType } from "./data-handlers/data-types";
import { EvictionPolicy } from "./eviction-policy";
import { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import type { MemoryConfig } from "./memory-config";
import { NormalizationManager } from "./normalization-manager";

interface SymbolStateManagerConfig extends MemoryConfig {
	/** Called for each candle whose low/high do not bound open/close (it is not stored). */
	onInconsistentCandle?: (symbol: TradingSymbol) => void;
}

export class SymbolStateManager {
	readonly states: Map<TradingSymbol, SymbolState> = new Map();
	private readonly _memoryManager: MemoryManager;
	private readonly _normManager: NormalizationManager;
	private readonly _evictionPolicy: EvictionPolicy;
	private readonly _onInconsistentCandle: SymbolStateManagerConfig["onInconsistentCandle"];

	constructor(config: SymbolStateManagerConfig) {
		this._onInconsistentCandle = config.onInconsistentCandle;
		this._evictionPolicy = config.evictionPolicy;
		this._memoryManager = new MemoryManager({
			maxSize: config.maxSize,
			maxMemoryBytes: config.maxMemoryBytes,
			evictionPolicy: config.evictionPolicy,
		});
		this._normManager = new NormalizationManager();
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

	private _createSymbolState(): SymbolState {
		return {
			...(candleHandler.createState() as Pick<SymbolState, "candles">),
			norm: this._normManager.createNormStats(),
		};
	}

	addData(dataType: DataType, symbol: TradingSymbol, data: unknown): void {
		const maxSize = this._memoryManager.getMaxSize();
		const state = this._getOrCreate(symbol);
		if (dataType !== DataType.Candle) {
			return;
		}
		const candle = data as CandleData;
		if (!isConsistentCandle(candle)) {
			this._onInconsistentCandle?.(symbol);
		}
		const isNew = candleHandler.isNew?.(state, candle) ?? true;
		candleHandler.mutateState({
			symbol,
			data: candle,
			state,
			maxSize,
		});
		// Normes cumulées sur toutes les bougies ajoutées, sans décrément à l'éviction (maxSize).
		if (isNew) {
			this._normManager.updateNorms(state, candle);
		}
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
		return candleHandler.estimateMemoryBytes(state);
	}

	getSymbols(): TradingSymbol[] {
		return Array.from(this.states.keys());
	}

	/** Normalization statistics of a symbol, as every handler serializes them. */
	serializeNorms(symbol: TradingSymbol): Record<string, unknown> {
		const state = this.getSymbolState(symbol);
		return state ? candleHandler.serializeNorms(state) : {};
	}

	getSymbolState(symbol: TradingSymbol): SymbolState | undefined {
		const state = this.states.get(symbol);
		if (!state) {
			return;
		}
		return { ...state };
	}

	/** Replaces the candles and their statistics: the result depends on `candles` only. */
	replaceCandles(symbol: TradingSymbol, candles: unknown[]): void {
		const state = this._getOrCreate(symbol);
		state.candles = [];
		Object.assign(state.norm, candleHandler.createNorms());
		for (const candle of candles) {
			this.addData(DataType.Candle, symbol, candle);
		}
	}

	getCandleCount(symbol: TradingSymbol): number {
		return this.states.get(symbol)?.candles.length ?? 0;
	}
}
