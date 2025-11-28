export interface BinanceOrderBookEntry {
  price: string;  // note : Binance send strings
  qty: string;
}

export interface BinanceDepthResponse {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}


export interface BinanceTrade {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
}

export interface BinanceTradeResponse extends Array<BinanceTrade> {}


export interface BinanceHistoricalTrade extends BinanceTrade {}
export interface BinanceHistoricalTradeResponse extends Array<BinanceHistoricalTrade> {}


export interface BinanceAggregateTrade {
  a :number; // Aggregate tradeId
  p : string; // Price
  q : string; // Quantity
  f : number; // First tradeId
  l : number; // Last tradeId
  T : number; // Timestamp
  m : boolean; // Was the buyer the maker?
  M : boolean; // Ignore
}

export interface BinanceAggregateTradeResponse extends Array<BinanceAggregateTrade> {};


export type BinanceCandlestickData = [
  number, // OpenTime
  string, // Open
  string, // High
  string, // Low
  string, // Close
  string, // Volume
  number, // CloseTime
  string, // QuoteAssetVolume
  number, // NumberOfTrades
  string, // TakerBuyBaseAssetVolume
  string, // TakerBuyQuoteAssetVolume
  string, // Ignore
]

export interface BinanceCandlestickDataResponse extends Array<BinanceCandlestickData> {};


export interface Binance24hrTickerStats {
  symbol: string;
  priceChange: string;
  PriceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  openTime: number;
  closeTime: number;
  firstId: number;   // First tradeId
  lastId: number;    // Last tradeId
  count: number;     // Trade count
}

export interface Binance24hrTickerStatsResponse extends Array<Binance24hrTickerStats> {}


export interface BinanceTradingDayTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface BinanceTradingDayTickerResponse extends Array<BinanceTradingDayTicker> {}


export interface BinanceSymbolPriceTicker {
  symbol: string;
  price: string;
}

export interface BinanceSymbolPriceTickerResponse extends Array<BinanceSymbolPriceTicker> {}


export interface BinanceSymbolOrderBookTicker {
  symbol: string;
  bidPrice: string;
  askPrice: string;
  bidQty: string;
  askQty: string;
}

export interface BinanceSymbolOrderBookTickerResponse extends Array<BinanceSymbolOrderBookTicker> {}