import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import type { SymbolStateSerializable } from "./buffer-serializable-types";
import {
	createDefaultHandlers,
	type DataHandler,
	serializeAllNorms,
} from "./data-handlers/data-handler";
import type { MarketDataBuffer } from "./market-data-buffer";

export class BufferSaver {
	private readonly _handlers: DataHandler[];

	constructor(private readonly _checkpointDir: string) {
		this._handlers = createDefaultHandlers();
	}

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
			const norms = serializeAllNorms(state, this._handlers);
			symbolsData[sym] = {
				candles: state.candles,
				trades: state.trades,
				orderBook: state.orderBook,
				bookTicker: state.bookTicker,
				ticker24h: state.ticker24h,
				...norms,
			} as SymbolStateSerializable;
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
