import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type {
	FilePath,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import { type Price, toSymbol } from "@trading-model/common/domain/primitives";
import type { SymbolStateSerializable } from "./buffer-serializable-types";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "./market-data-buffer";
import type { SymbolState } from "./market-data-types";
import { NormalizationStats } from "./normalization-stats";

export class BufferLoader {
	constructor(private readonly _checkpointDir: FilePath) {}

	private _bufferStatePath(): string {
		return join(this._checkpointDir, "market_data_buffer.json");
	}

	load(config?: MarketDataBufferConfig): MarketDataBuffer | null {
		try {
			return this._doLoadBuffer(config);
		} catch (err) {
			this._logBufferLoadError(err);
			return null;
		}
	}

	private _doLoadBuffer(
		config?: MarketDataBufferConfig
	): MarketDataBuffer | null {
		const path = this._bufferStatePath();
		if (!existsSync(path)) {
			logger.info("No market data buffer checkpoint found");
			return null;
		}
		const data = this._readBufferState(path);
		const buffer = this._restoreBuffer(data, config);
		logger.info("Market data buffer checkpoint loaded", {
			context: {
				symbols: Object.keys(data.symbols).length,
				path,
			},
		});
		return buffer;
	}

	private _logBufferLoadError(err: unknown): void {
		logger.error("Failed to load market data buffer checkpoint", {
			context: {
				error: err instanceof Error ? err.message : String(err),
			},
		});
	}

	private _readBufferState(path: string): {
		symbols: Record<TradingSymbol, SymbolStateSerializable>;
		priceSnapshot: Record<TradingSymbol, Price>;
	} {
		const raw = readFileSync(path, "utf-8");
		return JSON.parse(raw) as {
			symbols: Record<TradingSymbol, SymbolStateSerializable>;
			priceSnapshot: Record<TradingSymbol, Price>;
		};
	}

	private _restoreBuffer(
		data: {
			symbols: Record<TradingSymbol, SymbolStateSerializable>;
			priceSnapshot: Record<TradingSymbol, Price>;
		},
		config?: MarketDataBufferConfig
	): MarketDataBuffer {
		const buffer = new MarketDataBuffer(config);
		for (const [sym, sd] of Object.entries(data.symbols)) {
			buffer.restoreSymbolState(toSymbol(sym), _deserializeSymbolState(sd));
		}
		buffer.setPriceSnapshot(data.priceSnapshot);
		return buffer;
	}
}

function _deserializeNormState(
	sd: SymbolStateSerializable
): SymbolState["norm"] {
	return {
		candle: {
			close: NormalizationStats.fromJSON(sd.norm.candle.close),
			volume: NormalizationStats.fromJSON(sd.norm.candle.volume),
			open: NormalizationStats.fromJSON(sd.norm.candle.open),
			high: NormalizationStats.fromJSON(sd.norm.candle.high),
			low: NormalizationStats.fromJSON(sd.norm.candle.low),
		},
		trade: {
			price: NormalizationStats.fromJSON(sd.norm.trade.price),
			qty: NormalizationStats.fromJSON(sd.norm.trade.qty),
		},
		book: {
			bid: NormalizationStats.fromJSON(sd.norm.book.bid),
			ask: NormalizationStats.fromJSON(sd.norm.book.ask),
			spread: NormalizationStats.fromJSON(sd.norm.book.spread),
		},
		ticker: {
			volume: NormalizationStats.fromJSON(sd.norm.ticker.volume),
		},
	};
}

function _deserializeSymbolState(
	sd: SymbolStateSerializable
): Parameters<MarketDataBuffer["restoreSymbolState"]>[1] {
	return {
		candles: sd.candles,
		trades: sd.trades,
		orderBook: sd.orderBook,
		bookTicker: sd.bookTicker,
		ticker24h: sd.ticker24h,
		norm: _deserializeNormState(sd),
	};
}
