import {
	type BookTickerData,
	type CandleData,
	EnumEventMessage,
	type EventEnumMap,
	type OrderBookData,
	type TickerData,
	type TradeData,
} from "@trading-model/common/config/event.types";

import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { Price } from "@trading-model/common/domain/primitives";
import { Trainer } from "../core/trainer";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

/** Minimum fraction of buffer capacity before training fires for a symbol. */
const MIN_CANDLE_RATIO = 0.1;

export interface AppContainerConfig {
	bufferSize: number;
	symbols: TradingSymbol[];
	validationSplit: number;
	generations: number;
	populationSize: number;
	timeBudgetMs: number;
	episodesPerIndividual: number;
	bufferMemoryLimitMb?: number;
}

export class ApplicationContainer {
	public readonly dataBuffer: MarketDataBuffer;
	public readonly trainer: Trainer;
	private readonly _trainingInterval = new TimerHandle();

	constructor(config: AppContainerConfig) {
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryMb: config.bufferMemoryLimitMb ?? 512,
			evictionPolicy: "LRU",
		};
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this.trainer = new Trainer(this.dataBuffer);
	}

	onCandlestickSeries(data: { candle: CandleData[] }): void {
		if (!data?.candle || data.candle.length === 0) {
			return;
		}
		const symbol = data.candle[0].symbol;
		this.dataBuffer.addCandles(symbol, data.candle);
	}

	onRecentTrades(data: { trades: TradeData[] }): void {
		if (!data?.trades || data.trades.length === 0) {
			return;
		}
		const symbol = data.trades[0].symbol;
		this.dataBuffer.addTrades(symbol, data.trades);
	}

	onOrderBookSnapshot(data: { orderBook: OrderBookData[] }): void {
		if (!data?.orderBook || data.orderBook.length === 0) {
			return;
		}
		this.dataBuffer.setOrderBook(data.orderBook[0].symbol, data.orderBook[0]);
	}

	onOrderBookTickerSnapshot(data: { bookTicker: BookTickerData[] }): void {
		if (!data?.bookTicker || data.bookTicker.length === 0) {
			return;
		}
		for (const bt of data.bookTicker) {
			this.dataBuffer.setBookTicker(bt.symbol, bt);
		}
	}

	on24hrTickerStats(data: { ticker: TickerData[] }): void {
		if (!data?.ticker || data.ticker.length === 0) {
			return;
		}
		for (const tk of data.ticker) {
			this.dataBuffer.setTicker24h(tk.symbol, tk);
		}
	}

	onPriceTickerSnapshot(data: { price: Record<TradingSymbol, Price> }): void {
		if (!data?.price) {
			return;
		}
		this.dataBuffer.setPriceSnapshot(data.price);
	}

	getSubscribedIntents(): EventEnumMap[] {
		return [
			EnumEventMessage.fetchCandlestickSeries,
			EnumEventMessage.fetchRecentTrades,
			EnumEventMessage.fetchOrderBookSnapshot,
			EnumEventMessage.fetchOrderBookTickerSnapshot,
			EnumEventMessage.fetch24hrTickerStats,
			EnumEventMessage.fetchPriceTickerSnapshot,
		];
	}

	startTrainingLoop(symbols: TradingSymbol[], intervalMs: number): void {
		const runTraining = () => this._runTrainingForSymbols(symbols);

		void runTraining();
		this._trainingInterval.startInterval(runTraining, intervalMs);
	}

	private _hasEnoughData(symbol: TradingSymbol): boolean {
		return (
			this.dataBuffer.getCandleCount(symbol) >=
			this.dataBuffer.getMaxSize() * MIN_CANDLE_RATIO
		);
	}

	private async _trainSymbol(symbol: TradingSymbol): Promise<void> {
		await this.trainer.train(symbol);
	}

	private async _runTrainingForSymbols(symbols: TradingSymbol[]): Promise<void> {
		if (this.trainer.isTraining()) {
			return;
		}
		for (const symbol of symbols) {
			if (this._hasEnoughData(symbol)) {
				await this._trainSymbol(symbol);
				break;
			}
		}
	}

	stopTrainingLoop(): void {
		this._trainingInterval.stop();
	}
}
