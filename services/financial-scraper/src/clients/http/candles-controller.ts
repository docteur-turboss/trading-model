import type { SourceType } from "@trading-model/common/config/event.types";
import {
	toSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { selectCandlesBy } from "../../infra/market-data/schema/candles-schema";
import {
	createController,
	SOURCE_SCHEMA,
	SYMBOL_SCHEMA,
	TIMESTAMP_SCHEMA,
} from "./controller-utils";

export const GET_CANDLES_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectCandlesBy.symbol(toSymbol(params.symbol))
);

export const GET_CANDLES_BY_TIMESTAMP_CONTROLLER = createController(
	TIMESTAMP_SCHEMA,
	(params) =>
		selectCandlesBy.timestamp.after(
			UnixTimestamp.of(params.timestamp.getTime())
		)
);

export const GET_CANDLES_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectCandlesBy.source(params.source as SourceType)
);
