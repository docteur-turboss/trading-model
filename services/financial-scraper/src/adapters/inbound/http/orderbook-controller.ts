import type { SourceType } from "@trading-model/contracts/market-data.types";
import { toSymbol, UnixTimestamp } from "@trading-model/primitives/primitives";
import { selectOrderBookBy } from "../../outbound/persistence/schema/order-book.schema";
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
