import { getOrderBook } from "../clients/binance/binance.client";

export async function fetchOrderBook(symbol: string) {
  const depth = await getOrderBook(symbol, 100);

  return {
    lastUpdateId: depth.lastUpdateId,
    bids: depth.bids.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
    asks: depth.asks.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
  };
}