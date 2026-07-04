import { Router } from "express";

import {
	GET_CANDLES_BY_SOURCE_CONTROLLER,
	GET_CANDLES_BY_SYMBOL_CONTROLLER,
	GET_CANDLES_BY_TIMESTAMP_CONTROLLER,
	GET_ORDER_BOOK_BY_SOURCE_CONTROLLER,
	GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER,
	GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER,
	GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER,
	GET_TICKER_BY_SOURCE_CONTROLLER,
	GET_TICKER_BY_SYMBOL_CONTROLLER,
	GET_TICKER_BY_TIMESTAMP_CONTROLLER,
	GET_TRADE_BY_SOURCE_CONTROLLER,
	GET_TRADE_BY_SYMBOL_CONTROLLER,
	GET_TRADE_BY_TIMESTAMP_CONTROLLER,
} from "./controller";

/** Create an Express Router with all financial-data query endpoints (trades, tickers, candles, order books). */
export const FINANCIAL_ROUTES = (): Router => {
	/**
	 * Express router instance scoped to registry heartbeat concerns.
	 */
	const router = Router();

	router.get("/trade/sources/:source", GET_TRADE_BY_SOURCE_CONTROLLER);
	router.get("/trade/symbols/:symbol", GET_TRADE_BY_SYMBOL_CONTROLLER);
	router.get("/trade/timestamp/:timestamp", GET_TRADE_BY_TIMESTAMP_CONTROLLER);

	router.get("/ticker/sources/:source", GET_TICKER_BY_SOURCE_CONTROLLER);
	router.get("/ticker/symbols/:symbol", GET_TICKER_BY_SYMBOL_CONTROLLER);
	router.get(
		"/ticker/timestamp/:timestamp",
		GET_TICKER_BY_TIMESTAMP_CONTROLLER
	);

	router.get("/candles/sources/:source", GET_CANDLES_BY_SOURCE_CONTROLLER);
	router.get("/candles/symbols/:symbol", GET_CANDLES_BY_SYMBOL_CONTROLLER);
	router.get(
		"/candles/timestamp/:timestamp",
		GET_CANDLES_BY_TIMESTAMP_CONTROLLER
	);

	router.get("/orderbook/sources/:source", GET_ORDER_BOOK_BY_SOURCE_CONTROLLER);
	router.get("/orderbook/symbols/:symbol", GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER);
	router.get(
		"/orderbook/after/timestamp/:timestamp",
		GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER
	);
	router.get(
		"/heartbeat/before/timestamp/:timestamp",
		GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER
	);

	return router;
};
