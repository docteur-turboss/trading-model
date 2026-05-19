import { EnumEventMessage } from '@trading-model/common/config/event.types';
import {
  CandleEntity,
  TradeEntity,
  OrderBookEntity,
  BookTickerEntity,
  TickerEntity,
} from '@trading-model/common/config/event.types';
import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { bootstrapAddressManager } from '../config/address-manager';
import { MarketDataBuffer } from '../core/market-data-buffer';
import { MessageManager } from '../config/message-manager';
import { Trainer } from '../core/trainer';
import { createServer } from './server';
import { env } from '../config/env';

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;

const dataBuffer = new MarketDataBuffer(env.TRAINER_DATA_WINDOW);
const trainer = new Trainer(dataBuffer);
let trainingInterval: ReturnType<typeof setInterval> | null = null;
let subscribed = false;

createBootstrap({
  name: 'Trader Trainer',
  createServer: () => createServer(trainer),
  onStart: async () => {
    addressManager = bootstrapAddressManager();

    MessageManager.on(
      EnumEventMessage.fetchCandlestickSeries,
      (data: { candle: CandleEntity[] }) => {
        if (!data?.candle || data.candle.length === 0) return;
        const symbol = data.candle[0].symbol;
        dataBuffer.addCandles(symbol, data.candle);
        if (!subscribed && dataBuffer.getCandleCount(symbol) > 50) {
          subscribed = true;
          startTrainingLoop();
        }
      }
    );

    MessageManager.on(EnumEventMessage.fetchRecentTrades, (data: { trades: TradeEntity[] }) => {
      if (!data?.trades || data.trades.length === 0) return;
      const symbol = data.trades[0].symbol;
      dataBuffer.addTrades(symbol, data.trades);
    });

    MessageManager.on(
      EnumEventMessage.fetchOrderBookSnapshot,
      (data: { orderBook: OrderBookEntity[] }) => {
        if (!data?.orderBook || data.orderBook.length === 0) return;
        dataBuffer.setOrderBook(data.orderBook[0].symbol, data.orderBook[0]);
      }
    );

    MessageManager.on(
      EnumEventMessage.fetchOrderBookTickerSnapshot,
      (data: { bookTicker: BookTickerEntity[] }) => {
        if (!data?.bookTicker || data.bookTicker.length === 0) return;
        for (const bt of data.bookTicker) {
          dataBuffer.setBookTicker(bt.symbol, bt);
        }
      }
    );

    MessageManager.on(EnumEventMessage.fetch24hrTickerStats, (data: { ticker: TickerEntity[] }) => {
      if (!data?.ticker || data.ticker.length === 0) return;
      for (const tk of data.ticker) {
        dataBuffer.setTicker24h(tk.symbol, tk);
      }
    });

    MessageManager.on(
      EnumEventMessage.fetchPriceTickerSnapshot,
      (data: { price: Record<string, number> }) => {
        if (!data?.price) return;
        dataBuffer.setPriceSnapshot(data.price);
      }
    );

    await MessageManager.intents([
      EnumEventMessage.fetchCandlestickSeries,
      EnumEventMessage.fetchRecentTrades,
      EnumEventMessage.fetchOrderBookSnapshot,
      EnumEventMessage.fetchOrderBookTickerSnapshot,
      EnumEventMessage.fetch24hrTickerStats,
      EnumEventMessage.fetchPriceTickerSnapshot,
    ]);
  },
  onStop: async () => {
    if (trainingInterval) clearInterval(trainingInterval);
    if (addressManager) addressManager.stop();
    await MessageManager.stopMessageManager();
  },
});

function startTrainingLoop(): void {
  const symbols = env.TRAINER_SYMBOLS.split(',').map(s => s.trim());

  async function runTraining(): Promise<void> {
    if (trainer.isTraining()) return;

    for (const symbol of symbols) {
      if (dataBuffer.getCandleCount(symbol) >= env.TRAINER_DATA_WINDOW * 0.1) {
        await trainer.train(symbol);
        break;
      }
    }
  }

  runTraining();

  trainingInterval = setInterval(runTraining, 60_000);
}
