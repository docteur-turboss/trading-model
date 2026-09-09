/**
 * @deprecated Import per-context types directly:
 *   - MarketEvent, MarketEventMap, market data types from "@trading-model/common/contracts/market-data.types"
 *   - AuditEvent, AuditEventMap from "@trading-model/common/contracts/audit-events"
 */

import { AuditEvent } from "../contracts/audit-events";

/** @deprecated Use BaseMarketData from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use OhlcvData from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use CandleData from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use TradeData from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use OrderBookLevel from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use OrderBookData from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use BookTickerData from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use BidAsk from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use TickerData from "@trading-model/common/contracts/market-data.types" */
export type {
	BaseMarketData,
	BidAsk,
	BookTickerData,
	CandleData,
	OhlcvData,
	OrderBookData,
	OrderBookLevel,
	TickerData,
	TradeData,
} from "../contracts/market-data.types";
/** @deprecated Use MarketType from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use SourceType from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use CandleInterval from "@trading-model/common/contracts/market-data.types" */
/** @deprecated Use TradeSide from "@trading-model/common/contracts/market-data.types" */
export {
	CandleInterval,
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
	MarketType,
	SourceType,
	TradeSide,
} from "../contracts/market-data.types";
export { AuditEvent };

import { MarketEvent } from "../contracts/market-events";

export { MarketEvent };

import type { AuditEventMap } from "../contracts/audit-events";
import type { MarketEventMap } from "../contracts/market-events";

/** Union interface combining all per-context event maps. */
export interface EventMap extends MarketEventMap, AuditEventMap {}

/** Union of all valid event message string values. */
export type EventEnumMap = `${MarketEvent}` | `${AuditEvent}`;

/** Extracts the payload type for a given event message. */
export type EventMessagesArgs<TValue extends EventEnumMap> =
	TValue extends keyof EventMap ? EventMap[TValue] : never;

export type { AuditEventMap, MarketEventMap };
