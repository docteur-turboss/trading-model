import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";

import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "./market-data-buffer";
import type { SymbolState } from "./market-data-types";
import { NormalizationStats } from "./normalization-stats";

interface SymbolStateSerializable {
	candles: import("@trading-model/common/config/event.types").CandleData[];
	trades: import("@trading-model/common/config/event.types").TradeData[];
	orderBook:
		| import("@trading-model/common/config/event.types").OrderBookData
		| null;
	bookTicker:
		| import("@trading-model/common/config/event.types").BookTickerData
		| null;
	ticker24h:
		| import("@trading-model/common/config/event.types").TickerData
		| null;
	closeNorm: ReturnType<NormalizationStats["toJSON"]>;
	volumeNorm: ReturnType<NormalizationStats["toJSON"]>;
	openNorm: ReturnType<NormalizationStats["toJSON"]>;
	highNorm: ReturnType<NormalizationStats["toJSON"]>;
	lowNorm: ReturnType<NormalizationStats["toJSON"]>;
	tradePriceNorm: ReturnType<NormalizationStats["toJSON"]>;
	tradeQtyNorm: ReturnType<NormalizationStats["toJSON"]>;
	bidNorm: ReturnType<NormalizationStats["toJSON"]>;
	askNorm: ReturnType<NormalizationStats["toJSON"]>;
	spreadNorm: ReturnType<NormalizationStats["toJSON"]>;
	tickerVolumeNorm: ReturnType<NormalizationStats["toJSON"]>;
}

export class BufferCheckpointer {
	constructor(private readonly _checkpointDir: string) {}

	private _bufferStatePath(): string {
		return join(this._checkpointDir, "market_data_buffer.json");
	}

	save(buffer: MarketDataBuffer): void {
		try {
			this._doSaveBuffer(buffer);
		} catch (err) {
			this._logBufferSaveError(err);
		}
	}

	private _serializeSymbols(
		buffer: MarketDataBuffer,
		symbols: string[]
	): Record<string, SymbolStateSerializable> {
		const symbolsData: Record<string, SymbolStateSerializable> = {};
		for (const sym of symbols) {
			const state = buffer.getSymbolState(sym);
			if (!state) {
				continue;
			}
			symbolsData[sym] = {
				candles: state.candles,
				trades: state.trades,
				orderBook: state.orderBook,
				bookTicker: state.bookTicker,
				ticker24h: state.ticker24h,
				closeNorm: state.norm.candleClose.toJSON(),
				volumeNorm: state.norm.candleVolume.toJSON(),
				openNorm: state.norm.candleOpen.toJSON(),
				highNorm: state.norm.candleHigh.toJSON(),
				lowNorm: state.norm.candleLow.toJSON(),
				tradePriceNorm: state.norm.tradePrice.toJSON(),
				tradeQtyNorm: state.norm.tradeQty.toJSON(),
				bidNorm: state.norm.bid.toJSON(),
				askNorm: state.norm.ask.toJSON(),
				spreadNorm: state.norm.spread.toJSON(),
				tickerVolumeNorm: state.norm.tickerVolume.toJSON(),
			};
		}
		return symbolsData;
	}

	private _doSaveBuffer(buffer: MarketDataBuffer): void {
		const symbols = buffer.getSymbols();
		const symbolsData = this._serializeSymbols(buffer, symbols);
		writeFileSync(
			this._bufferStatePath(),
			JSON.stringify(
				{
					symbols: symbolsData,
					priceSnapshot: buffer.getPriceSnapshot(),
					savedAt: Date.now(),
				},
				null,
				2
			),
			"utf-8"
		);
		logger.info("Market data buffer checkpoint saved", {
			context: {
				symbols: symbols.length,
				path: this._bufferStatePath(),
			},
		});
	}

	private _logBufferSaveError(err: unknown): void {
		logger.error("Failed to save market data buffer checkpoint", {
			context: {
				error: err instanceof Error ? err.message : String(err),
			},
		});
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
		symbols: Record<string, SymbolStateSerializable>;
		priceSnapshot: Record<string, number>;
	} {
		const raw = readFileSync(path, "utf-8");
		return JSON.parse(raw) as {
			symbols: Record<string, SymbolStateSerializable>;
			priceSnapshot: Record<string, number>;
		};
	}

	private _restoreBuffer(
		data: {
			symbols: Record<string, SymbolStateSerializable>;
			priceSnapshot: Record<string, number>;
		},
		config?: MarketDataBufferConfig
	): MarketDataBuffer {
		const buffer = new MarketDataBuffer(config);
		for (const [sym, sd] of Object.entries(data.symbols)) {
			buffer.restoreSymbolState(sym, _deserializeSymbolState(sd));
		}
		buffer.setPriceSnapshot(data.priceSnapshot);
		return buffer;
	}
}

function _deserializeNormState(
	sd: SymbolStateSerializable
): SymbolState["norm"] {
	return {
		candleClose: NormalizationStats.fromJSON(sd.closeNorm),
		candleVolume: NormalizationStats.fromJSON(sd.volumeNorm),
		candleOpen: NormalizationStats.fromJSON(sd.openNorm),
		candleHigh: NormalizationStats.fromJSON(sd.highNorm),
		candleLow: NormalizationStats.fromJSON(sd.lowNorm),
		tradePrice: NormalizationStats.fromJSON(sd.tradePriceNorm),
		tradeQty: NormalizationStats.fromJSON(sd.tradeQtyNorm),
		bid: NormalizationStats.fromJSON(sd.bidNorm),
		ask: NormalizationStats.fromJSON(sd.askNorm),
		spread: NormalizationStats.fromJSON(sd.spreadNorm),
		tickerVolume: NormalizationStats.fromJSON(sd.tickerVolumeNorm),
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
