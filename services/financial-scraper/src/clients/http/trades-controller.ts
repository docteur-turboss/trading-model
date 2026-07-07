import type { SourceType } from "@trading-model/common/config/event.types";
import {
	toSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { selectTradesBy } from "../../infra/market-data/schema/trades.schema";
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
