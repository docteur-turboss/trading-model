import z from "zod";
import { catchSync } from "@trading-model/common/middleware/catchError";
import { selectTradesBy } from "infra/market-data/schema/trades.schema";
import { selectTickerBy } from "infra/market-data/schema/ticker24h.schema";
import { selectOrderBookBy } from "infra/market-data/schema/orderBook.schema";
import { ResponseException } from "@trading-model/common/middleware/responseException";
import { selectCandlesBy } from "infra/market-data/schema/candles-schema";

const symbolSchema = z.object({
  symbol: z.string("Symbol is required and must be a string.").min(1),
});

const sourceSchema = z.object({
  source: z.string("Source is required and must be a string.").min(1),
});

const timestampSchema = z.object({
  timestamp: z.coerce.date("Timestamp must be a valid date or a parsable date string."),
});

const orderBookTimestampSchema = z.object({
  timestamp: z.coerce.number("Timestamp must be a valid numeric value."),
});

function createController<T>(
  schema: z.ZodSchema<T>,
  fetcher: (params: T) => Promise<unknown>
) {
  return catchSync(async (req) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success)
      throw ResponseException(parsed.error.message).BadRequest();

    try {
      throw ResponseException(
        JSON.stringify(await fetcher(parsed.data))
      ).Success();
    } catch (e) {
      if (e instanceof Error && e.message.includes("No result returned"))
        throw ResponseException("No data found").NotFound();
      throw e;
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                                Trades routes                               */
/* -------------------------------------------------------------------------- */

export const GetTradeBySymbolController = createController(
  symbolSchema,
  (p) => selectTradesBy.symbol(p.symbol)
);

export const GetTradeByTimestampController = createController(
  timestampSchema,
  (p) => selectTradesBy.timestamp(p.timestamp)
);

export const GetTradeBySourceController = createController(
  sourceSchema,
  (p) => selectTradesBy.source(p.source)
);

/* -------------------------------------------------------------------------- */
/*                                Ticker routes                               */
/* -------------------------------------------------------------------------- */

export const GetTickerBySymbolController = createController(
  symbolSchema,
  (p) => selectTickerBy.symbol(p.symbol)
);

export const GetTickerByTimestampController = createController(
  timestampSchema,
  (p) => selectTickerBy.timestamp(p.timestamp)
);

export const GetTickerBySourceController = createController(
  sourceSchema,
  (p) => selectTickerBy.source(p.source)
);

/* -------------------------------------------------------------------------- */
/*                             OrderBook routes                               */
/* -------------------------------------------------------------------------- */

export const GetOrderBookBySymbolController = createController(
  symbolSchema,
  (p) => selectOrderBookBy.symbol(p.symbol)
);

export const GetOrderBookByTimestampAfterController = createController(
  orderBookTimestampSchema,
  (p) => selectOrderBookBy.timestamp.after(p.timestamp)
);

export const GetOrderBookByTimestampBeforeController = createController(
  orderBookTimestampSchema,
  (p) => selectOrderBookBy.timestamp.before(p.timestamp)
);

export const GetOrderBookBySourceController = createController(
  sourceSchema,
  (p) => selectOrderBookBy.source(p.source)
);

/* -------------------------------------------------------------------------- */
/*                               Candles routes                               */
/* -------------------------------------------------------------------------- */

export const GetCandlesBySymbolController = createController(
  symbolSchema,
  (p) => selectCandlesBy.symbol(p.symbol)
);

export const GetCandlesByTimestampController = createController(
  timestampSchema,
  (p) => selectCandlesBy.timestamp.after(p.timestamp)
);

export const GetCandlesBySourceController = createController(
  sourceSchema,
  (p) => selectCandlesBy.source(p.source)
);
