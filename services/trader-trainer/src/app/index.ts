import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { ApplicationContainer } from './container';
import { createServer } from './server';
import { bootstrapAddressManager } from '../config/address-manager';
import { env } from '../config/env';
import { MessageManager } from '../config/message-manager';

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;

const container = new ApplicationContainer({
  bufferSize: env.TRAINER_DATA_WINDOW,
  symbols: env.TRAINER_SYMBOLS.split(',').map(s => s.trim()),
  validationSplit: env.TRAINER_VALIDATION_SPLIT,
  generations: env.TRAINER_GENERATIONS,
  populationSize: env.TRAINER_POPULATION_SIZE,
  timeBudgetMs: env.TRAINER_TIME_BUDGET_MS,
  episodesPerIndividual: env.TRAINER_EPISODES_PER_INDIVIDUAL,
});

const { trainer } = container;

createBootstrap({
  name: 'Trader Trainer',
  createServer: () => createServer(trainer),
  onStart: async () => {
    addressManager = bootstrapAddressManager();

    MessageManager.on('fetchCandlestickSeries' as never, (data: never) =>
      container.onCandlestickSeries(data as never)
    );
    MessageManager.on('fetchRecentTrades' as never, (data: never) =>
      container.onRecentTrades(data as never)
    );
    MessageManager.on('fetchOrderBookSnapshot' as never, (data: never) =>
      container.onOrderBookSnapshot(data as never)
    );
    MessageManager.on('fetchOrderBookTickerSnapshot' as never, (data: never) =>
      container.onOrderBookTickerSnapshot(data as never)
    );
    MessageManager.on('fetch24hrTickerStats' as never, (data: never) =>
      container.on24hrTickerStats(data as never)
    );
    MessageManager.on('fetchPriceTickerSnapshot' as never, (data: never) =>
      container.onPriceTickerSnapshot(data as never)
    );

    await MessageManager.intents(container.getSubscribedIntents());

    container.startTrainingLoop(
      env.TRAINER_SYMBOLS.split(',').map(s => s.trim()),
      60_000
    );
  },
  onStop: async () => {
    container.stopTrainingLoop();
    if (addressManager) addressManager.stop();
    await MessageManager.stopMessageManager();
  },
});
