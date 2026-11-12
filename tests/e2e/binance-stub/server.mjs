/**
 * Binance REST stub for the E2E data-flow test: serves the public market data
 * endpoints the financial-scraper calls, in the exact wire format of
 * api.binance.com (depth levels and klines are tuples, numbers are strings).
 * Keep the shapes in sync with the real API: a stub that invents its own
 * format hides the parsing bugs this test exists to catch.
 *
 * Usage: bun server.mjs (listens on PORT, default 8080)
 */
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const MINUTE = 60_000;
const BASE_PRICE = { BTCUSDT: 80_000, ETHUSDT: 3_000 };

const price = (symbol, delta = 0) => ((BASE_PRICE[symbol] ?? 100) + delta).toFixed(8);

function symbolsParam(url) {
  const raw = url.searchParams.get('symbols');
  return raw ? JSON.parse(raw) : [url.searchParams.get('symbol')];
}

function depth(symbol, limit) {
  const levels = (side) =>
    Array.from({ length: Math.min(limit, 5) }, (_, i) => [price(symbol, side * (i + 1)), '0.50000000']);
  return { lastUpdateId: Date.now(), bids: levels(-1), asks: levels(1) };
}

function trades(symbol, limit) {
  const now = Date.now();
  return Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
    id: now + i,
    price: price(symbol),
    qty: '0.01000000',
    quoteQty: (Number(price(symbol)) * 0.01).toFixed(8),
    time: now - i * 1000,
    isBuyerMaker: i % 2 === 0,
    isBestMatch: true,
  }));
}

// Like Binance: ascending, the still-open candle last; from `startTime` when
// given, else the latest `limit` candles.
function klines(symbol, limit, startTime) {
  const lastOpen = Math.floor(Date.now() / MINUTE) * MINUTE;
  const count = Math.min(limit, 200);
  const firstOpen = startTime
    ? Math.ceil(startTime / MINUTE) * MINUTE
    : lastOpen - (count - 1) * MINUTE;
  const length = Math.max(0, Math.min(count, (lastOpen - firstOpen) / MINUTE + 1));
  return Array.from({ length }, (_, i) => {
    const openTime = firstOpen + i * MINUTE;
    return [
      openTime,
      price(symbol),
      price(symbol, 10),
      price(symbol, -10),
      price(symbol, 5),
      '1.00000000',
      openTime + MINUTE - 1,
      price(symbol),
      42,
      '0.50000000',
      price(symbol),
      '0',
    ];
  });
}

function ticker24h(symbol) {
  const now = Date.now();
  return {
    symbol,
    priceChange: '5.00000000',
    priceChangePercent: '0.010',
    weightedAvgPrice: price(symbol),
    prevClosePrice: price(symbol),
    lastPrice: price(symbol, 5),
    lastQty: '0.01000000',
    bidPrice: price(symbol, -1),
    bidQty: '0.50000000',
    askPrice: price(symbol, 1),
    askQty: '0.50000000',
    openPrice: price(symbol),
    highPrice: price(symbol, 10),
    lowPrice: price(symbol, -10),
    volume: '100.00000000',
    quoteVolume: '8000000.00000000',
    openTime: now - 24 * 60 * MINUTE,
    closeTime: now,
    firstId: 1,
    lastId: 100,
    count: 100,
  };
}

const ROUTES = {
  '/api/v3/ping': () => ({}),
  '/api/v3/depth': (url) => depth(url.searchParams.get('symbol'), Number(url.searchParams.get('limit') ?? 100)),
  '/api/v3/trades': (url) => trades(url.searchParams.get('symbol'), Number(url.searchParams.get('limit') ?? 500)),
  '/api/v3/klines': (url) =>
    klines(
      url.searchParams.get('symbol'),
      Number(url.searchParams.get('limit') ?? 500),
      Number(url.searchParams.get('startTime') ?? 0),
    ),
  '/api/v3/ticker/24hr': (url) => symbolsParam(url).map(ticker24h),
  '/api/v3/ticker/price': (url) => symbolsParam(url).map((symbol) => ({ symbol, price: price(symbol, 5) })),
  '/api/v3/ticker/bookTicker': (url) =>
    symbolsParam(url).map((symbol) => ({
      symbol,
      bidPrice: price(symbol, -1),
      bidQty: '0.50000000',
      askPrice: price(symbol, 1),
      askQty: '0.50000000',
    })),
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const route = ROUTES[url.pathname];
    console.log(`${req.method} ${url.pathname}${url.search} -> ${route ? 200 : 404}`);
    res.writeHead(route ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(route ? route(url) : { code: -1, msg: 'Not stubbed' }));
  })
  .listen(PORT, () => console.log(`Binance stub listening on ${PORT}`));
