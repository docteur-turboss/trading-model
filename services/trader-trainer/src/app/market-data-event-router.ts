import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import {
	CandleEventHandler,
	TradeEventHandler,
	OrderBookEventHandler,
	BookTickerEventHandler,
	TickerEventHandler,
	PriceEventHandler,
} from "./event-handlers";

export class MarketDataEventRouter {
	public readonly dataBuffer: MarketDataBuffer;
	private readonly _candleHandler: CandleEventHandler;
	private readonly _tradeHandler: TradeEventHandler;
	private readonly _orderBookHandler: OrderBookEventHandler;
	private readonly _bookTickerHandler: BookTickerEventHandler;
	private readonly _tickerHandler: TickerEventHandler;
	private readonly _priceHandler: PriceEventHandler;

	constructor(bufferConfig: MarketDataBufferConfig) {
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this._candleHandler = new CandleEventHandler(this.dataBuffer);
		this._tradeHandler = new TradeEventHandler(this.dataBuffer);
		this._orderBookHandler = new OrderBookEventHandler(this.dataBuffer);
		this._bookTickerHandler = new BookTickerEventHandler(this.dataBuffer);
		this._tickerHandler = new TickerEventHandler(this.dataBuffer);
		this._priceHandler = new PriceEventHandler(this.dataBuffer);
	}

	onCandlestickSeries(data: Parameters<CandleEventHandler["onCandlestickSeries"]>[0]): void {
		this._candleHandler.onCandlestickSeries(data);
	}

	onRecentTrades(data: Parameters<TradeEventHandler["onRecentTrades"]>[0]): void {
		this._tradeHandler.onRecentTrades(data);
	}

	onOrderBookSnapshot(data: Parameters<OrderBookEventHandler["onOrderBookSnapshot"]>[0]): void {
		this._orderBookHandler.onOrderBookSnapshot(data);
	}

	onOrderBookTickerSnapshot(data: Parameters<BookTickerEventHandler["onOrderBookTickerSnapshot"]>[0]): void {
		this._bookTickerHandler.onOrderBookTickerSnapshot(data);
	}

	on24hrTickerStats(data: Parameters<TickerEventHandler["on24hrTickerStats"]>[0]): void {
		this._tickerHandler.on24hrTickerStats(data);
	}

	onPriceTickerSnapshot(data: Parameters<PriceEventHandler["onPriceTickerSnapshot"]>[0]): void {
		this._priceHandler.onPriceTickerSnapshot(data);
	}

	getSubscribedIntents(): string[] {
		return this._candleHandler.getSubscribedIntents();
	}
}
