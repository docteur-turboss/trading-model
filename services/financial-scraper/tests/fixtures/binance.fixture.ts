import type {
  BinanceDepthResponse,
  BinanceTradeResponse,
  BinanceHistoricalTrade,
  BinanceAggregateTradeResponse,
  BinanceCandlestickData,
  Binance24hrTickerStats,
  BinanceTradingDayTicker,
  BinanceSymbolPriceTicker,
  BinanceSymbolOrderBookTicker,
} from '../../src/types/binance.api';

export const mockDepthResponse: BinanceDepthResponse = {
  lastUpdateId: 1027024,
  bids: [
    ['0.0024', '10.0'],
    ['0.0023', '5.0'],
  ],
  asks: [
    ['0.0026', '8.0'],
    ['0.0027', '3.0'],
  ],
};

export const mockTradeResponse: BinanceTradeResponse = [
  {
    id: 28457,
    price: '4.00000100',
    qty: '12.00000000',
    quoteQty: '0.00004800',
    time: 1499865549590,
    isBuyerMaker: true,
    isBestMatch: true,
  },
  {
    id: 28458,
    price: '4.00000200',
    qty: '8.00000000',
    quoteQty: '0.00003200',
    time: 1499865549591,
    isBuyerMaker: false,
    isBestMatch: true,
  },
];

export const mockHistoricalTradeResponse: BinanceHistoricalTrade[] = [
  {
    id: 28457,
    price: '4.00000100',
    qty: '12.00000000',
    quoteQty: '0.00004800',
    time: 1499865549590,
    isBuyerMaker: true,
    isBestMatch: true,
  },
];

export const mockAggregateTradeResponse: BinanceAggregateTradeResponse = [
  { a: 28457, p: '4.00000100', q: '12.00000000', f: 1, l: 2, T: 1499865549590, m: true, M: true },
];

export const mockCandlestickResponse: BinanceCandlestickData[] = [
  [
    1499040000000,
    '0.01634790',
    '0.80000000',
    '0.01575800',
    '0.01577100',
    '148976.11427815',
    1499644799999,
    '2434.19055334',
    308,
    '1756.87402397',
    '28.46694368',
    '0',
  ],
];

export const mock24hrTickerResponse: Binance24hrTickerStats[] = [
  {
    symbol: 'BTCUSDT',
    priceChange: '-94.99999800',
    priceChangePercent: '-95.960',
    weightedAvgPrice: '0.29628482',
    prevClosePrice: '99.00000000',
    openPrice: '99.00000000',
    highPrice: '100.00000000',
    lowPrice: '0.10000000',
    lastPrice: '4.00000200',
    bidPrice: '4.00000000',
    bidQty: '10.00000000',
    askPrice: '4.00000200',
    askQty: '10.00000000',
    volume: '8913.30000000',
    openTime: 1499783040000,
    closeTime: 1499869440000,
    firstId: 28385,
    lastId: 28460,
    count: 76,
  },
];

export const mockTradingDayTickerResponse: BinanceTradingDayTicker[] = [
  {
    symbol: 'BTCUSDT',
    priceChange: '-94.99999800',
    priceChangePercent: '-95.960',
    weightedAvgPrice: '0.29628482',
    openPrice: '99.00000000',
    highPrice: '100.00000000',
    lowPrice: '0.10000000',
    lastPrice: '4.00000200',
    volume: '8913.30000000',
    quoteVolume: '15.30000000',
    openTime: 1499783040000,
    closeTime: 1499869440000,
    firstId: 28385,
    lastId: 28460,
    count: 76,
  },
];

export const mockPriceTickerResponse: BinanceSymbolPriceTicker[] = [
  { symbol: 'BTCUSDT', price: '50000.00' },
];

export const mockBookTickerResponse: BinanceSymbolOrderBookTicker[] = [
  {
    symbol: 'BTCUSDT',
    bidPrice: '49990.00',
    bidQty: '0.50000000',
    askPrice: '50010.00',
    askQty: '1.00000000',
  },
];
