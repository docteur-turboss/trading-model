import type { SourceType } from "@trading-model/contracts/market-data.types";
import { toSymbol, UnixTimestamp } from "@trading-model/primitives/primitives";
import { selectTradesBy } from "../../outbound/persistence/schema/trades.schema";
import {
	createController,
	SOURCE_SCHEMA,
	SYMBOL_SCHEMA,
	TIMESTAMP_SCHEMA,
} from "./controller-utils";

export const GET_TRADE_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectTradesBy.symbol(toSymbol(params.symbol))
);

export const GET_TRADE_BY_TIMESTAMP_CONTROLLER = createController(
	TIMESTAMP_SCHEMA,
	(params) =>
		selectTradesBy.timestamp(UnixTimestamp.of(params.timestamp.getTime()))
);

export const GET_TRADE_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectTradesBy.source(params.source as SourceType)
);
