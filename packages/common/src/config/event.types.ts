/**
 * @deprecated Import per-context types directly:
 *   - MarketEvent, MarketEventMap, market data types from "../contracts/market-data.types"
 *   - AuditEvent, AuditEventMap from "../contracts/audit-events"
 *   - CertificateEvent, CertificateEventMap from "../contracts/certificate-events"
 *   - MarketEventMap, AuditEventMap, CertificateEventMap from their respective files
 */

export { AuditEvent } from "../contracts/audit-events";
export { CertificateEvent } from "../contracts/certificate-events";
/** @deprecated Use BaseMarketData from "../contracts/market-data.types" */
/** @deprecated Use OhlcvData from "../contracts/market-data.types" */
/** @deprecated Use CandleData from "../contracts/market-data.types" */
/** @deprecated Use TradeData from "../contracts/market-data.types" */
/** @deprecated Use OrderBookLevel from "../contracts/market-data.types" */
/** @deprecated Use OrderBookData from "../contracts/market-data.types" */
/** @deprecated Use BookTickerData from "../contracts/market-data.types" */
/** @deprecated Use BidAsk from "../contracts/market-data.types" */
/** @deprecated Use TickerData from "../contracts/market-data.types" */
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
/** @deprecated Use MarketType from "../contracts/market-data.types" */
/** @deprecated Use SourceType from "../contracts/market-data.types" */
/** @deprecated Use CandleInterval from "../contracts/market-data.types" */
/** @deprecated Use TradeSide from "../contracts/market-data.types" */
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
export { MarketEvent } from "../contracts/market-events";

import { AuditEvent } from "../contracts/audit-events";
import { CertificateEvent } from "../contracts/certificate-events";
import { MarketEvent } from "../contracts/market-events";

/**
 * @deprecated Use per-context enums: MarketEvent, AuditEvent, CertificateEvent.
 */
export const EnumEventMessage = {
	...MarketEvent,
	...AuditEvent,
	...CertificateEvent,
} as const;
/** @deprecated Use MarketEvent | AuditEvent | CertificateEvent as a type. */
export type EnumEventMessage =
	(typeof EnumEventMessage)[keyof typeof EnumEventMessage];

import type { AuditEventMap } from "../contracts/audit-events";
import type { CertificateEventMap } from "../contracts/certificate-events";
import type { MarketEventMap } from "../contracts/market-events";

/** Union interface combining all per-context event maps. */
export interface EventMap
	extends MarketEventMap,
		AuditEventMap,
		CertificateEventMap {}

/** Union of all valid event message string values. */
export type EventEnumMap = `${EnumEventMessage}`;

/** Extracts the payload type for a given event message. */
export type EventMessagesArgs<TValue extends EventEnumMap> =
	TValue extends keyof EventMap ? EventMap[TValue] : never;

export type { AuditEventMap, CertificateEventMap, MarketEventMap };
