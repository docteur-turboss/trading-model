import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { mountRoute } from "@trading-model/http/api-route/mount-route";
import { toJsonWire } from "@trading-model/http/json-wire";
import { sendResponse } from "@trading-model/http/response-exception";
import { Router } from "express";
import { SIGNAL_REGISTRY } from "../../../config/signal-registry";
import type { MarketDataPage } from "../../../domain/market-data.types";
import {
	selectCandlesBy,
	selectLatestClosedCandles,
} from "../../outbound/persistence/schema/candles.schema";
import { selectTickerBy } from "../../outbound/persistence/schema/ticker24h.schema";
import { MySqlSignalStore } from "../../outbound/persistence/signal-store";
import {
	encodeCursor,
	MAX_SIGNALS_PER_ANSWER,
	MAX_SINCE_WINDOW_MS,
	SCRAPER_API,
} from "./api-routes";

/** 200 with the rows as JSON. */
function json(body: unknown) {
	return sendResponse(JSON.stringify(body, toJsonWire), HTTP_STATUS.OK);
}

type PageQuery = (page: MarketDataPage) => Promise<PageRow[]>;
interface PageRow {
	id: number;
	timestamp: Date;
}

/**
 * One keyset page (ADR-0054): reads one row more than `limit` to tell whether
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

function _registerTickerRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.tickersBySymbol, ({ params, query }) =>
		page((window) => selectTickerBy.symbol(params.symbol, window), query)
	);
	mountRoute(router, SCRAPER_API.tickersAt, ({ params, query }) =>
		page((window) => selectTickerBy.timestamp(params.timestamp, window), query)
	);
}

function _registerCandleRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.candlesBySymbol, ({ params, query }) =>
		page((window) => selectCandlesBy.symbol(params.symbol, window), query)
	);
	mountRoute(router, SCRAPER_API.candlesLatest, async ({ query }) =>
		json({ rows: await selectLatestClosedCandles(query.symbols, new Date()) })
	);
	mountRoute(router, SCRAPER_API.candlesSince, ({ params, query }) =>
		page(
			(window) => selectCandlesBy.timestamp.after(params.timestamp, window),
			{
				...query,
				to: Math.min(
					query.to ?? Number.POSITIVE_INFINITY,
					params.timestamp + MAX_SINCE_WINDOW_MS
				),
			}
		)
	);
}

function _registerSignalRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.assets, () =>
		sendResponse(
			{ assets: [...SIGNAL_REGISTRY.assets.values()] },
			HTTP_STATUS.OK
		)
	);
	// Never the key variable (`accessPolicy.auth`).
	mountRoute(router, SCRAPER_API.sources, () =>
		sendResponse(
			{
				sources: SIGNAL_REGISTRY.sources.map(
					({ id, covers, schedule, reliabilityScore, accessPolicy }) => ({
						id,
						covers,
						schedule,
						reliabilityScore,
						terms: accessPolicy.terms,
						termsUrl: accessPolicy.termsUrl,
						attribution: accessPolicy.attribution,
					})
				),
			},
			HTTP_STATUS.OK
		)
	);
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
			areas: asset.areas ?? [],
			dimensions: query.dimension
				? asset.applicableDimensions.filter((name) => name === query.dimension)
				: asset.applicableDimensions,
			sourceId: query.sourceId,
			metric: query.metric,
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

/** Create an Express Router with all financial-data query endpoints (tickers, candles, signals). */
export const FINANCIAL_ROUTES = (): Router => {
	const router = Router();

	_registerTickerRoutes(router);
	_registerCandleRoutes(router);
	_registerSignalRoutes(router);

	return router;
};
