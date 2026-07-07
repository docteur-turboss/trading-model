import type { SourceType } from "@trading-model/common/config/event.types";
import {
	toSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { selectOrderBookBy } from "../../infra/market-data/schema/order-book.schema";
import {
	createController,
	ORDER_BOOK_TIMESTAMP_SCHEMA,
	SOURCE_SCHEMA,
	SYMBOL_SCHEMA,
} from "./controller-utils";

export const GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER = createController(
	SYMBOL_SCHEMA,
	(params) => selectOrderBookBy.symbol(toSymbol(params.symbol))
);

export const GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER = createController(
	ORDER_BOOK_TIMESTAMP_SCHEMA,
	(params) =>
		selectOrderBookBy.timestamp.after(UnixTimestamp.of(params.timestamp))
);

export const GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER = createController(
	ORDER_BOOK_TIMESTAMP_SCHEMA,
	(params) =>
		selectOrderBookBy.timestamp.before(UnixTimestamp.of(params.timestamp))
);

export const GET_ORDER_BOOK_BY_SOURCE_CONTROLLER = createController(
	SOURCE_SCHEMA,
	(params) => selectOrderBookBy.source(params.source as SourceType)
);
