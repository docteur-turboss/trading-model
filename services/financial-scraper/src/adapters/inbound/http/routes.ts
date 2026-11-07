import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { toJsonWire } from "@trading-model/http/infrastructure/json-wire";
import { Router } from "express";
import { SIGNAL_REGISTRY } from "../../../config/signal-registry";
import { selectCandlesBy } from "../../outbound/persistence/schema/candles-schema";
import { selectTickerBy } from "../../outbound/persistence/schema/ticker24h.schema";
import { selectTradesBy } from "../../outbound/persistence/schema/trades.schema";
import { MySqlSignalStore } from "../../outbound/persistence/signal-store";
import { MAX_SIGNALS_PER_ANSWER, SCRAPER_API } from "./api-routes";

/**
 * 200 with the rows as JSON. `toJsonWire` sends BIGINT trade ids as decimal
 * strings (plain JSON.stringify throws on a bigint).
 */
async function rows(query: Promise<unknown>) {
	return sendResponse(JSON.stringify(await query, toJsonWire), HTTP_STATUS.OK);
}

function _registerTradeRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.tradesBySource, ({ params }) =>
		rows(selectTradesBy.source(params.source))
	);
	mountRoute(router, SCRAPER_API.tradesBySymbol, ({ params }) =>
		rows(selectTradesBy.symbol(params.symbol))
	);
	mountRoute(router, SCRAPER_API.tradesAt, ({ params }) =>
		rows(selectTradesBy.timestamp(params.timestamp))
	);
}

function _registerTickerRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.tickersBySource, ({ params }) =>
		rows(selectTickerBy.source(params.source))
	);
	mountRoute(router, SCRAPER_API.tickersBySymbol, ({ params }) =>
		rows(selectTickerBy.symbol(params.symbol))
	);
	mountRoute(router, SCRAPER_API.tickersAt, ({ params }) =>
		rows(selectTickerBy.timestamp(params.timestamp))
	);
}

function _registerCandleRoutes(router: Router): void {
	mountRoute(router, SCRAPER_API.candlesBySource, ({ params }) =>
		rows(selectCandlesBy.source(params.source))
	);
	mountRoute(router, SCRAPER_API.candlesBySymbol, ({ params }) =>
		rows(selectCandlesBy.symbol(params.symbol))
	);
	mountRoute(router, SCRAPER_API.candlesSince, ({ params }) =>
		rows(selectCandlesBy.timestamp.after(params.timestamp))
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

/** Create an Express Router with all financial-data query endpoints (trades, tickers, candles, signals). */
export const FINANCIAL_ROUTES = (): Router => {
	const router = Router();

	_registerTradeRoutes(router);
	_registerTickerRoutes(router);
	_registerCandleRoutes(router);
	_registerSignalRoutes(router);

	return router;
};
