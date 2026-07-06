import type { SourceType } from "@trading-model/common/config/event.types";
import { toSymbol, UnixTimestamp } from "@trading-model/common/domain/primitives";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import zod from "zod";

import { selectCandlesBy } from "../../infra/market-data/schema/candles-schema";
import { selectOrderBookBy } from "../../infra/market-data/schema/order-book.schema";
import { selectTickerBy } from "../../infra/market-data/schema/ticker24h.schema";
import { selectTradesBy } from "../../infra/market-data/schema/trades.schema";

const SYMBOL_SCHEMA = zod.object({
	symbol: zod.string("Symbol is required and must be a string.").min(1),
});

const SOURCE_SCHEMA = zod.object({
	source: zod.string("Source is required and must be a string.").min(1),
});

const TIMESTAMP_SCHEMA = zod.object({
	timestamp: zod.coerce.date(
		"Timestamp must be a valid date or a parsable date string."
	),
});

const ORDER_BOOK_TIMESTAMP_SCHEMA = zod.object({
	timestamp: zod.coerce.number("Timestamp must be a valid numeric value."),
});

function createController<TBody>(
	schema: zod.ZodSchema<TBody>,
	fetcher: (params: TBody) => Promise<unknown>
) {
	return catchSync(async (req) => {
		const parsed = schema.safeParse(req.params);
		if (!parsed.success) {
			return sendResponse({ error: parsed.error.message }, 400);
		}

		try {
			return sendResponse(JSON.stringify(await fetcher(parsed.data)), 200);
		} catch (err) {
			if (err instanceof Error && err.message.includes("No result returned")) {
				return sendResponse({ error: "No data found" }, 404);
			}
			throw err instanceof Error ? err : new Error(String(err));
		}
	});
}

/* -------------------------------------------------------------------------- */
/*                                Trades routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns trades matching the given symbol. */
export const GET_TRADE_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectTradesBy.symbol(toSymbol(params.symbol))
);

/** Controller that returns trades at the given timestamp. */
export const GET_TRADE_BY_TIMESTAMP_CONTROLLER = createController(
	TIMESTAMP_SCHEMA,
	(params) => selectTradesBy.timestamp(UnixTimestamp.of(params.timestamp.getTime()))
);

/** Controller that returns trades from the given source. */
export const GET_TRADE_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectTradesBy.source(params.source as SourceType)
);

/* -------------------------------------------------------------------------- */
/*                                Ticker routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns tickers matching the given symbol. */
export const GET_TICKER_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectTickerBy.symbol(toSymbol(params.symbol))
);

/** Controller that returns tickers at the given timestamp. */
export const GET_TICKER_BY_TIMESTAMP_CONTROLLER = createController(
	TIMESTAMP_SCHEMA,
	(params) => selectTickerBy.timestamp(UnixTimestamp.of(params.timestamp.getTime()))
);

/** Controller that returns tickers from the given source. */
export const GET_TICKER_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectTickerBy.source(params.source as SourceType)
);

/* -------------------------------------------------------------------------- */
/*                             OrderBook routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns order-book snapshots matching the given symbol. */
export const GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectOrderBookBy.symbol(toSymbol(params.symbol))
);

/** Controller that returns order-book snapshots after the given timestamp. */
export const GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER = createController(
	ORDER_BOOK_TIMESTAMP_SCHEMA,
	(params) => selectOrderBookBy.timestamp.after(UnixTimestamp.of(params.timestamp))
);

/** Controller that returns order-book snapshots before the given timestamp. */
export const GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER = createController(
	ORDER_BOOK_TIMESTAMP_SCHEMA,
	(params) => selectOrderBookBy.timestamp.before(UnixTimestamp.of(params.timestamp))
);

/** Controller that returns order-book snapshots from the given source. */
export const GET_ORDER_BOOK_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectOrderBookBy.source(params.source as SourceType)
);

/* -------------------------------------------------------------------------- */
/*                               Candles routes                               */
/* -------------------------------------------------------------------------- */

/** Controller that returns candles matching the given symbol. */
export const GET_CANDLES_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectCandlesBy.symbol(toSymbol(params.symbol))
);

/** Controller that returns candles after the given timestamp. */
export const GET_CANDLES_BY_TIMESTAMP_CONTROLLER = createController(
	TIMESTAMP_SCHEMA,
	(params) => selectCandlesBy.timestamp.after(UnixTimestamp.of(params.timestamp.getTime()))
);

/** Controller that returns candles from the given source. */
export const GET_CANDLES_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectCandlesBy.source(params.source as SourceType)
);
