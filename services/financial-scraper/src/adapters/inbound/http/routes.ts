import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { toJsonWire } from "@trading-model/http/infrastructure/json-wire";
import { Router } from "express";
import { SIGNAL_REGISTRY } from "../../../config/signal-registry";
import type { MarketDataPage } from "../../../domain/market-data.types";
import { selectCandlesBy } from "../../outbound/persistence/schema/candles-schema";
import { selectOrderBookBy } from "../../outbound/persistence/schema/order-book.schema";
import { selectTickerBy } from "../../outbound/persistence/schema/ticker24h.schema";
import { selectTradesBy } from "../../outbound/persistence/schema/trades.schema";
import { MySqlSignalStore } from "../../outbound/persistence/signal-store";
import {
	encodeCursor,
	MAX_SIGNALS_PER_ANSWER,
	SCRAPER_API,
} from "./api-routes";

/**
 * 200 with the rows as JSON. `toJsonWire` sends BIGINT trade ids as decimal
 * strings (plain JSON.stringify throws on a bigint) and order book levels
 * (Sets) as arrays (plain JSON.stringify turns them into `{}`).
 */
function json(body: unknown) {
	return sendResponse(JSON.stringify(body, toJsonWire), HTTP_STATUS.OK);
}

type PageQuery = (page: MarketDataPage) => Promise<PageRow[]>;
interface PageRow {
	id: number;
	timestamp: Date;
}

/**
 * One keyset page (ADR-0053): reads one row more than `limit` to tell whether
 * any are left, and drops the internal `id` from the rows.
 */
async function page(select: PageQuery, { limit, ...window }: MarketDataPage) {
	const found = await select({ ...window, limit: limit + 1 });
	const rows = found.slice(0, limit);
	const last = rows[rows.length - 1];
	const nextCursor =
		found.length > limit && last
			? encodeCursor({ timestamp: last.timestamp.getTime(), id: last.id })
			: null;
	return json({
		rows: rows.map(({ id: _id, ...row }) => row),
		nextCursor,
		truncated: nextCursor !== null,
	});
}

/**
 * Order book lookups answer `null` for an unknown key and may hold gaps.
 * shortcut: the snapshots are all read before the cut; issue #554 decides
 * their storage.
 */
async function orderBooks(
	query: Promise<readonly unknown[] | null>,
	limit: number
) {
	const books = ((await query) ?? []).filter(Boolean);
	return json({
		rows: books.slice(0, limit),
		truncated: books.length > limit,
	});
}

function _registerTradeRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.tradesBySource, ({ params, query }) =>
		page((window) => selectTradesBy.source(params.source, window), query)
	);
	mountRoute(router, SCRAPER_API.tradesBySymbol, ({ params, query }) =>
		page((window) => selectTradesBy.symbol(params.symbol, window), query)
	);
	mountRoute(router, SCRAPER_API.tradesAt, ({ params, query }) =>
		page((window) => selectTradesBy.timestamp(params.timestamp, window), query)
	);
}

function _registerTickerRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.tickersBySource, ({ params, query }) =>
		page((window) => selectTickerBy.source(params.source, window), query)
	);
	mountRoute(router, SCRAPER_API.tickersBySymbol, ({ params, query }) =>
		page((window) => selectTickerBy.symbol(params.symbol, window), query)
	);
	mountRoute(router, SCRAPER_API.tickersAt, ({ params, query }) =>
		page((window) => selectTickerBy.timestamp(params.timestamp, window), query)
	);
}

function _registerCandleRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.candlesBySource, ({ params, query }) =>
		page((window) => selectCandlesBy.source(params.source, window), query)
	);
	mountRoute(router, SCRAPER_API.candlesBySymbol, ({ params, query }) =>
		page((window) => selectCandlesBy.symbol(params.symbol, window), query)
	);
	mountRoute(router, SCRAPER_API.candlesSince, ({ params, query }) =>
		page(
			(window) => selectCandlesBy.timestamp.after(params.timestamp, window),
			query
		)
	);
}

function _registerOrderBookRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.orderBooksBySource, ({ params, query }) =>
		orderBooks(selectOrderBookBy.source(params.source), query.limit)
	);
	mountRoute(router, SCRAPER_API.orderBooksBySymbol, ({ params, query }) =>
		orderBooks(selectOrderBookBy.symbol(params.symbol), query.limit)
	);
	mountRoute(router, SCRAPER_API.orderBooksAfter, ({ params, query }) =>
		orderBooks(selectOrderBookBy.timestamp.after(params.timestamp), query.limit)
	);
	mountRoute(router, SCRAPER_API.orderBooksBefore, ({ params, query }) =>
		orderBooks(
			selectOrderBookBy.timestamp.before(params.timestamp),
			query.limit
		)
	);
}

function _registerSignalRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.assetSignals, async ({ params, query }) => {
		const asset = SIGNAL_REGISTRY.assets.get(params.assetId);
		if (!asset) {
			return sendResponse(
				{ error: `Unknown asset ${params.assetId}` },
				HTTP_STATUS.NOT_FOUND
			);
		}
		// One more than an answer holds tells whether the window was cut.
		const signals = await MySqlSignalStore.findForAsset({
			assetId: asset.id,
			sector: asset.sector,
			dimensions: asset.applicableDimensions,
			from: query.from,
			to: query.to,
			limit: MAX_SIGNALS_PER_ANSWER + 1,
		});
		return sendResponse(
			{
				asset,
				signals: signals.slice(0, MAX_SIGNALS_PER_ANSWER),
				truncated: signals.length > MAX_SIGNALS_PER_ANSWER,
			},
			HTTP_STATUS.OK
		);
	});
}

/** Create an Express Router with all financial-data query endpoints (trades, tickers, candles, order books, signals). */
export const FINANCIAL_ROUTES = (): Router => {
	const router = Router();

	_registerTradeRoutes(router);
	_registerTickerRoutes(router);
	_registerCandleRoutes(router);
	_registerOrderBookRoutes(router);
	_registerSignalRoutes(router);

	return router;
};
