import { writeFileSync } from "node:fs";
import { logger } from "@trading-model/common/config/logger";
import type {
	FilePath,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import { bufferStatePath, logBufferCheckpointError } from "./buffer-checkpoint";
import type { SymbolStateSerializable } from "./buffer-serializable-types";
import {
	createDefaultHandlers,
	type DataHandler,
	serializeAllNorms,
} from "./data-handlers/data-handler";
import type { MarketDataBuffer } from "./market-data-buffer";

export class BufferSaver {
	private readonly _handlers: DataHandler[];

	constructor(private readonly _checkpointDir: FilePath) {
		this._handlers = createDefaultHandlers();
	}

	private _bufferStatePath(): string {
		return bufferStatePath(this._checkpointDir);
	}

	save(buffer: MarketDataBuffer): void {
		try {
			this._doSaveBuffer(buffer);
		} catch (err) {
			logBufferCheckpointError("save", err);
		}
	}

	private _serializeSymbol(
		buffer: MarketDataBuffer,
		sym: TradingSymbol
	): SymbolStateSerializable | undefined {
		const state = buffer.getSymbolState(sym);
		if (!state) {
			return;
		}
		const norms = serializeAllNorms(state, this._handlers);
		return {
			candles: state.candles,
			trades: state.trades,
			orderBook: state.orderBook,
			bookTicker: state.bookTicker,
			ticker24h: state.ticker24h,
			norm: norms,
		} as unknown as SymbolStateSerializable;
	}

	private _serializeSymbols(
		buffer: MarketDataBuffer,
		symbols: TradingSymbol[]
	): Record<TradingSymbol, SymbolStateSerializable> {
		const symbolsData: Record<TradingSymbol, SymbolStateSerializable> = {};
		for (const sym of symbols) {
			const serialized = this._serializeSymbol(buffer, sym);
			if (serialized) {
				symbolsData[sym] = serialized;
			}
		}
		return symbolsData;
	}

	private _writeBufferState(
		_symbols: TradingSymbol[],
		symbolsData: Record<TradingSymbol, SymbolStateSerializable>,
		priceSnapshot: Record<
			TradingSymbol,
			import("@trading-model/common/domain/primitives").Price
		>
	): void {
		writeFileSync(
			this._bufferStatePath(),
			JSON.stringify(
				{ symbols: symbolsData, priceSnapshot, savedAt: Date.now() },
				null,
				2
			),
			"utf-8"
		);
	}

	private _doSaveBuffer(buffer: MarketDataBuffer): void {
		const symbols = buffer.getSymbols();
		const symbolsData = this._serializeSymbols(buffer, symbols);
		this._writeBufferState(symbols, symbolsData, buffer.getPriceSnapshot());
		logger.info("Market data buffer checkpoint saved", {
			context: { symbols: symbols.length, path: this._bufferStatePath() },
		});
	}
}
