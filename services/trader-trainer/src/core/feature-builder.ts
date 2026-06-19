import {
  getAvgBid,
  getAvgAsk,
  getBidTotalQty,
  getAskTotalQty,
} from '@trading-model/common/config/event.types';

import { FEATURE_DIM, SymbolState, TradingSymbol } from './market-data-types';

export function buildFeatures(
  s: SymbolState,
  idx: number,
  priceSnapshot: Record<string, number>
): Float32Array {
  const f = new Float32Array(FEATURE_DIM);
  const cur = s.candles[idx];
  const prev = s.candles[idx - 1];

  // ---- Candle-derived (0-8) ----
  f[0] = s.closeNorm.normalize(cur.close);
  f[1] = s.volumeNorm.normalize(cur.volume);
  f[2] = prev && prev.close > 0 ? (cur.close - prev.close) / prev.close : 0;
  f[3] = cur.high - cur.low > 0 ? (cur.close - cur.open) / (cur.high - cur.low) : 0;
  f[4] = cur.close > 0 ? (cur.high - cur.low) / cur.close : 0;
  f[5] = s.openNorm.normalize(cur.open);
  f[6] = s.highNorm.normalize(cur.high);
  f[7] = s.lowNorm.normalize(cur.low);

  const volStd = s.volumeNorm.getStd();
  f[8] = volStd > 1e-10 ? cur.volume / volStd : 0;

  // ---- Order book (9-12) ----
  const obAvg = orderBookAverages(s);
  if (obAvg) {
    f[9] = s.bidNorm.normalize(obAvg.avgBid);
    f[10] = s.askNorm.normalize(obAvg.avgAsk);
    f[11] = obAvg.avgAsk > 0 && obAvg.avgBid > 0 ? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk : 0;
    const totalQty = obAvg.bidQty + obAvg.askQty;
    f[12] = totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0;
  }

  // ---- Book ticker (13-15) ----
  if (s.bookTicker) {
    const bt = s.bookTicker;
    f[13] = s.bidNorm.normalize(bt.bid);
    f[14] = s.askNorm.normalize(bt.ask);
    const spread = bt.ask - bt.bid;
    f[15] = bt.ask > 0 ? spread / bt.ask : 0;
  }

  // ---- Recent trades (16-18) ----
  const recentTrades = s.trades.filter(t => t.timestamp >= cur.timestamp - 60000);
  if (recentTrades.length > 0) {
    const avgPrice = recentTrades.reduce((a, t) => a + t.price, 0) / recentTrades.length;
    const totalQty = recentTrades.reduce((a, t) => a + t.quantity, 0);
    const buyQty = recentTrades.filter(t => t.side === 'buy').reduce((a, t) => a + t.quantity, 0);
    f[16] = s.tradePriceNorm.normalize(avgPrice);
    f[17] = s.tradeQtyNorm.normalize(totalQty);
    f[18] = totalQty > 0 ? buyQty / totalQty : 0.5;
  }

  // ---- 24h ticker (19-21) ----
  if (s.ticker24h) {
    const tk = s.ticker24h;
    f[19] = tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
    f[20] = s.tickerVolumeNorm.normalize(tk.volume);
    f[21] = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
  }

  // ---- Price ticker snapshot (22) ----
  const snapPrice = priceSnapshot[s.candles[idx].symbol as TradingSymbol] ?? cur.close;
  f[22] = s.closeNorm.normalize(snapPrice);

  // ---- Sliding window: last 8 closes (23-30) ----
  const lookbackStart = Math.max(0, idx - 8);
  let fi = 23;
  for (let j = lookbackStart; j < idx && fi < 31; j++) {
    f[fi++] = s.closeNorm.normalize(s.candles[j].close);
  }
  while (fi < 31) {
    f[fi++] = 0;
  }

  // ---- Bias (31) ----
  f[31] = 1.0;

  return f;
}

function orderBookAverages(s: SymbolState): {
  avgBid: number;
  avgAsk: number;
  bidQty: number;
  askQty: number;
} | null {
  if (s.orderBook) {
    const ob = s.orderBook;
    return {
      avgBid: getAvgBid(ob),
      avgAsk: getAvgAsk(ob),
      bidQty: getBidTotalQty(ob),
      askQty: getAskTotalQty(ob),
    };
  }
  return null;
}
