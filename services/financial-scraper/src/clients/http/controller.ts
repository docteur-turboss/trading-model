import z from 'zod';
import { catchSync } from '@trading-model/common/middleware/catch-error';
import { selectTradesBy } from '../../infra/market-data/schema/trades.schema';
import { selectTickerBy } from '../../infra/market-data/schema/ticker24h.schema';
import { selectOrderBookBy } from '../../infra/market-data/schema/order-book.schema';
import { ResponseException } from '@trading-model/common/middleware/response-exception';
import { selectCandlesBy } from '../../infra/market-data/schema/candles-schema';

const symbolSchema = z.object({
  symbol: z.string('Symbol is required and must be a string.').min(1),
});

const sourceSchema = z.object({
  source: z.string('Source is required and must be a string.').min(1),
});

const timestampSchema = z.object({
  timestamp: z.coerce.date('Timestamp must be a valid date or a parsable date string.'),
});

const orderBookTimestampSchema = z.object({
  timestamp: z.coerce.number('Timestamp must be a valid numeric value.'),
});

function createController<T>(schema: z.ZodSchema<T>, fetcher: (params: T) => Promise<unknown>) {
  return catchSync(async req => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) throw ResponseException(parsed.error.message).BadRequest();

    try {
      throw ResponseException(JSON.stringify(await fetcher(parsed.data))).Success();
    } catch (e) {
      if (e instanceof Error && e.message.includes('No result returned'))
        throw ResponseException('No data found').NotFound();
      throw e;
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                                Trades routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns trades matching the given symbol. */
export const GetTradeBySymbolController = createController(symbolSchema, p =>
  selectTradesBy.symbol(p.symbol)
);

/** Controller that returns trades at the given timestamp. */
export const GetTradeByTimestampController = createController(timestampSchema, p =>
  selectTradesBy.timestamp(p.timestamp)
);

/** Controller that returns trades from the given source. */
export const GetTradeBySourceController = createController(sourceSchema, p =>
  selectTradesBy.source(p.source)
);

/* -------------------------------------------------------------------------- */
/*                                Ticker routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns tickers matching the given symbol. */
export const GetTickerBySymbolController = createController(symbolSchema, p =>
  selectTickerBy.symbol(p.symbol)
);

/** Controller that returns tickers at the given timestamp. */
export const GetTickerByTimestampController = createController(timestampSchema, p =>
  selectTickerBy.timestamp(p.timestamp)
);

/** Controller that returns tickers from the given source. */
export const GetTickerBySourceController = createController(sourceSchema, p =>
  selectTickerBy.source(p.source)
);

/* -------------------------------------------------------------------------- */
/*                             OrderBook routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns order-book snapshots matching the given symbol. */
export const GetOrderBookBySymbolController = createController(symbolSchema, p =>
  selectOrderBookBy.symbol(p.symbol)
);

/** Controller that returns order-book snapshots after the given timestamp. */
export const GetOrderBookByTimestampAfterController = createController(
  orderBookTimestampSchema,
  p => selectOrderBookBy.timestamp.after(p.timestamp)
);

/** Controller that returns order-book snapshots before the given timestamp. */
export const GetOrderBookByTimestampBeforeController = createController(
  orderBookTimestampSchema,
  p => selectOrderBookBy.timestamp.before(p.timestamp)
);

/** Controller that returns order-book snapshots from the given source. */
export const GetOrderBookBySourceController = createController(sourceSchema, p =>
  selectOrderBookBy.source(p.source)
);

/* -------------------------------------------------------------------------- */
/*                               Candles routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns candles matching the given symbol. */
export const GetCandlesBySymbolController = createController(symbolSchema, p =>
  selectCandlesBy.symbol(p.symbol)
);

/** Controller that returns candles after the given timestamp. */
export const GetCandlesByTimestampController = createController(timestampSchema, p =>
  selectCandlesBy.timestamp.after(p.timestamp)
);

/** Controller that returns candles from the given source. */
export const GetCandlesBySourceController = createController(sourceSchema, p =>
  selectCandlesBy.source(p.source)
);
