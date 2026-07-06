import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

import { MarketDataBuffer } from "./market-data-buffer";
import type { SymbolStateSerializable } from "./buffer-serializable-types";

export class BufferSaver {
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
		symbols: TradingSymbol[]
	): Record<TradingSymbol, SymbolStateSerializable> {
		const symbolsData: Record<TradingSymbol, SymbolStateSerializable> = {};
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
}
