import { OrderBookEntity, CandleEntity, TradeEntity } from './event.types';

export function getAvgBid(ob: OrderBookEntity): number {
  let sum = 0;
  for (const b of ob.bids) sum += b.price;
  return ob.bids.size > 0 ? sum / ob.bids.size : 0;
}

export function getAvgAsk(ob: OrderBookEntity): number {
  let sum = 0;
  for (const a of ob.asks) sum += a.price;
  return ob.asks.size > 0 ? sum / ob.asks.size : 0;
}

export function getSpread(ob: OrderBookEntity): number {
  return getAvgAsk(ob) - getAvgBid(ob);
}

export function getMidPrice(ob: OrderBookEntity): number {
  return (getAvgBid(ob) + getAvgAsk(ob)) / 2;
}

export function getBidTotalQty(ob: OrderBookEntity): number {
  let qty = 0;
  for (const b of ob.bids) qty += b.quantity;
  return qty;
}

export function getAskTotalQty(ob: OrderBookEntity): number {
  let qty = 0;
  for (const a of ob.asks) qty += a.quantity;
  return qty;
}

export function isBullish(candle: CandleEntity): boolean {
  return candle.close >= candle.open;
}

export function getCandleBodySize(candle: CandleEntity): number {
  return Math.abs(candle.close - candle.open);
}

export function isBuyTrade(trade: TradeEntity): boolean {
  return trade.side === 'buy';
}

export function isSellTrade(trade: TradeEntity): boolean {
  return trade.side === 'sell';
}
