import { 
  MarketType, 
  SourceType, 
  TradeEntity, 
  CandleEntity, 
  OrderBookEntity,
  TickerEntity,
} from "infra/market-data/market-data.types";
import { Binance24hrTickerStatsResponse, BinanceAggregateTradeResponse, BinanceCandlestickDataResponse, BinanceDepthResponse, BinanceHistoricalTradeResponse, BinanceSymbolOrderBookTickerResponse, BinanceSymbolPriceTickerResponse, BinanceTradeResponse, BinanceTradingDayTickerResponse } from "types/binance.api";

export class BinanceNormalizer {
  /**
   * Convertit le carnet d’ordres Binance en structure normalisée.
   */
  static orderBook(
    symbol: string,
    payload: BinanceDepthResponse
  ): OrderBookEntity {
    const bids = new Set(payload.bids.map(([price, qty]) => ({
      price: Number(price),
      quantity: Number(qty),
    })))

    const asks = new Set(payload.asks.map(([price, qty]) => ({
      price: Number(price),
      quantity: Number(qty),
    })))

    return {
      symbol,
      source: SourceType.BINANCE,
      market: MarketType.CRYPTO,
      bids: bids,
      asks: asks,
      timestamp: Date.now(),
    };
  }

  /**
   * Normalise les trades (recent + historical).
   */
  static trades(
    symbol: string,
    payload: BinanceTradeResponse | BinanceHistoricalTradeResponse,
  ): TradeEntity[] {
    return payload.map((t) => ({
      symbol,
      tradeId: BigInt(t.id),
      price: Number(t.price),
      quantity: Number(t.qty),
      timestamp: t.time,
      side: t.isBuyerMaker ? "sell" : "buy",
      source: SourceType.BINANCE,
      market: MarketType.CRYPTO
    }));
  }

  /**
   * Normalise les aggregate trades.
   */
  static aggregateTrades(
    symbol: string,
    payload: BinanceAggregateTradeResponse
  ): TradeEntity[] {
    return payload.map((t) => ({
      symbol,
      tradeId: BigInt(t.a),
      price: Number(t.p),
      quantity: Number(t.q),
      timestamp: t.T,
      side: t.m ? "sell" : "buy",
      source: SourceType.BINANCE,
      market: MarketType.CRYPTO
    }));
  }

  /**
   * Normalise les chandeliers.
   */
  static candles(
    symbol: string,
    interval: string,
    payload: BinanceCandlestickDataResponse
  ): CandleEntity[] {
    return payload.map((c) => ({
      symbol,
      interval,
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
      closeTimestamp: Number(c[6]),
      trades: c[8],
      timestamp: c[0],
      source: SourceType.BINANCE,
      market: MarketType.CRYPTO
    }));
  }

  /**
   * Normalise ticker 24h.
   */
  static ticker24h(
    payload: Binance24hrTickerStatsResponse
  ): TickerEntity[] {
    return payload.map((t) => ({
      market: MarketType.CRYPTO,
      source: SourceType.BINANCE,
      timestamp: t.openTime,
      symbol: t.symbol,
      open: Number(t.openPrice),
      high: Number(t.highPrice),
      low: Number(t.lowPrice),
      last: Number(t.lastPrice),
      volume: Number(t.volume),
      closeTimestamp: t.closeTime,
    }));
  }

  /**
   * Normalise trading day ticker.
   */
  static tradingDayTicker(
    payload: BinanceTradingDayTickerResponse
  ): TickerEntity[] {
    return payload.map((t) => ({
      market: MarketType.CRYPTO,
      source: SourceType.BINANCE,
      timestamp: t.openTime,
      symbol: t.symbol,
      open: Number(t.openPrice),
      high: Number(t.highPrice),
      low: Number(t.lowPrice),
      last: Number(t.lastPrice),
      volume: Number(t.volume),
      closeTimestamp: t.closeTime,
    }));
  }

  /**
   * Normalise price ticker.
   */
  static priceTicker(
    payload: BinanceSymbolPriceTickerResponse
  ): Record<string, number> {
    return Object.fromEntries(
      payload.map((p) => [p.symbol, Number(p.price)])
    );
  }

  /**
   * Normalise book ticker.
   */
  static bookTicker(
    payload: BinanceSymbolOrderBookTickerResponse
  ) {
    return payload.map((b) => ({
      symbol: b.symbol,
      bid: Number(b.bidPrice),
      ask: Number(b.askPrice),
      bidQty: Number(b.bidQty),
      askQty: Number(b.askQty),
    }));
  }
}