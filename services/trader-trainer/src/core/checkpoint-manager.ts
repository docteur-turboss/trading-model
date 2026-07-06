import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";

import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "./market-data-buffer";
import { NormalizationStats } from "./normalization-stats";

export interface CheckpointManagerConfig {
	checkpointDir: string;
	maxCheckpoints?: number;
}

export class CheckpointManager {
	private readonly _checkpointDir: string;
	private readonly _maxCheckpoints: number;

	constructor(config: CheckpointManagerConfig) {
		this._checkpointDir = config.checkpointDir;
		this._maxCheckpoints = config.maxCheckpoints ?? 5;

		if (!existsSync(this._checkpointDir)) {
			mkdirSync(this._checkpointDir, { recursive: true });
			logger.info("Created checkpoint directory", { context: { dir: this._checkpointDir } });
		}
	}

	private _checkpointPath(symbol: string): string {
		return join(this._checkpointDir, `best_genome_${symbol}.json`);
	}

	private _metadataPath(symbol: string): string {
		return join(this._checkpointDir, `metadata_${symbol}.json`);
	}

	save(symbol: string, genome: DeepReadonly<LamarckGenome>): void {
		try {
			const path = this._checkpointPath(symbol);
			writeFileSync(path, JSON.stringify(genome, null, 2), "utf-8");
			writeFileSync(
				this._metadataPath(symbol),
				JSON.stringify({
					savedAt: Date.now(),
					symbol,
					generation: genome.generation,
					fitness: genome.fitness,
				}),
				"utf-8"
			);
			logger.info("Checkpoint saved", { context: {
				symbol,
				generation: genome.generation,
				path,
			} });
		} catch (err) {
			logger.error("Failed to save checkpoint", { context: {
				symbol,
				error: err instanceof Error ? err.message : String(err),
			} });
		}
	}

	load(symbol: string): DeepReadonly<LamarckGenome> | null {
		try {
			const path = this._checkpointPath(symbol);
			if (!existsSync(path)) {
				logger.info("No checkpoint found for symbol", { context: { symbol } });
				return null;
			}
			const raw = readFileSync(path, "utf-8");
			const genome = JSON.parse(raw) as DeepReadonly<LamarckGenome>;
			logger.info("Checkpoint loaded", { context: {
				symbol,
				generation: genome.generation,
				fitness: genome.fitness,
			} });
			return genome;
		} catch (err) {
			logger.error("Failed to load checkpoint", { context: {
				symbol,
				error: err instanceof Error ? err.message : String(err),
			} });
			return null;
		}
	}

	list(): {
		symbol: string;
		generation: number;
		fitness: number;
		savedAt: number;
	}[] {
		if (!existsSync(this._checkpointDir)) {
			return [];
		}
		const files = readdirSync(this._checkpointDir).filter((file) =>
			file.startsWith("metadata_")
		);
		return this._readMetadataFiles(files)
			.sort((_prev, _next) => _next.savedAt - _prev.savedAt)
			.slice(0, this._maxCheckpoints);
	}

	private _readMetadataFiles(
		files: string[]
	): { symbol: string; generation: number; fitness: number; savedAt: number }[] {
		const results: {
			symbol: string;
			generation: number;
			fitness: number;
			savedAt: number;
		}[] = [];
		for (const file of files) {
			try {
				const raw = readFileSync(join(this._checkpointDir, file), "utf-8");
				const meta = JSON.parse(raw);
				results.push({
					symbol: meta.symbol,
					generation: meta.generation,
					fitness: meta.fitness,
					savedAt: meta.savedAt,
				});
			} catch {
				/* skip unreadable */
			}
		}
		return results;
	}

	private _bufferStatePath(): string {
		return join(this._checkpointDir, "market_data_buffer.json");
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

	saveBuffer(buffer: MarketDataBuffer): void {
		try {
			const symbols = buffer.getSymbols();
			const priceSnapshot = buffer.getPriceSnapshot();
			const symbolsData = this._serializeSymbols(buffer, symbols);

			writeFileSync(
				this._bufferStatePath(),
				JSON.stringify(
					{ symbols: symbolsData, priceSnapshot, savedAt: Date.now() },
					null,
					2
				),
				"utf-8"
			);
			logger.info("Market data buffer checkpoint saved", { context: {
				symbols: symbols.length,
				path: this._bufferStatePath(),
			} });
		} catch (err) {
			logger.error("Failed to save market data buffer checkpoint", { context: {
				error: err instanceof Error ? err.message : String(err),
			} });
		}
	}

	loadBuffer(config?: MarketDataBufferConfig): MarketDataBuffer | null {
		try {
			const path = this._bufferStatePath();
			if (!existsSync(path)) {
				logger.info("No market data buffer checkpoint found");
				return null;
			}

			const data = this._readBufferState(path);
			const buffer = this._restoreBuffer(data, config);

			logger.info("Market data buffer checkpoint loaded", { context: {
				symbols: Object.keys(data.symbols).length,
				path,
			} });
			return buffer;
		} catch (err) {
			logger.error("Failed to load market data buffer checkpoint", { context: {
				error: err instanceof Error ? err.message : String(err),
			} });
			return null;
		}
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

function _deserializeSymbolState(
	sd: SymbolStateSerializable
): Parameters<MarketDataBuffer["restoreSymbolState"]>[1] {
	return {
		candles: sd.candles,
		trades: sd.trades,
		orderBook: sd.orderBook,
		bookTicker: sd.bookTicker,
		ticker24h: sd.ticker24h,
		norm: {
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
		},
	};
}

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
