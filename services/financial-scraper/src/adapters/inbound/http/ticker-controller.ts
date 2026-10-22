import type { SourceType } from "@trading-model/contracts/market-data.types";
import { toSymbol, UnixTimestamp } from "@trading-model/primitives/primitives";
import { selectTickerBy } from "../../outbound/persistence/schema/ticker24h.schema";
import {
	createController,
	SOURCE_SCHEMA,
	SYMBOL_SCHEMA,
	TIMESTAMP_SCHEMA,
} from "./controller-utils";

export const GET_TICKER_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectTickerBy.symbol(toSymbol(params.symbol))
);

export const GET_TICKER_BY_TIMESTAMP_CONTROLLER = createController(
	TIMESTAMP_SCHEMA,
	(params) =>
		selectTickerBy.timestamp(UnixTimestamp.of(params.timestamp.getTime()))
);

export const GET_TICKER_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectTickerBy.source(params.source as SourceType)
);
