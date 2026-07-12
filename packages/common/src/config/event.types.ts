/**
 * @deprecated Import per-context types directly:
 *   - MarketEvent, MarketEventMap, market data types from "@trading-model/validation/contracts/market-data.types"
 *   - AuditEvent, AuditEventMap from "@trading-model/validation/contracts/audit-events"
 *   - CertificateEvent, CertificateEventMap from "@trading-model/validation/contracts/certificate-events"
 *   - MarketEventMap, AuditEventMap, CertificateEventMap from their respective files
 */

export { AuditEvent } from "@trading-model/validation/contracts/audit-events";
export { CertificateEvent } from "@trading-model/validation/contracts/certificate-events";
/** @deprecated Use BaseMarketData from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use OhlcvData from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use CandleData from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use TradeData from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use OrderBookLevel from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use OrderBookData from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use BookTickerData from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use BidAsk from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use TickerData from "@trading-model/validation/contracts/market-data.types" */
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
} from "@trading-model/validation/contracts/market-data.types";
/** @deprecated Use MarketType from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use SourceType from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use CandleInterval from "@trading-model/validation/contracts/market-data.types" */
/** @deprecated Use TradeSide from "@trading-model/validation/contracts/market-data.types" */
export {
	CandleInterval,
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
	MarketType,
	SourceType,
	TradeSide,
} from "@trading-model/validation/contracts/market-data.types";
export { MarketEvent } from "@trading-model/validation/contracts/market-events";

import { AuditEvent } from "@trading-model/validation/contracts/audit-events";
import { CertificateEvent } from "@trading-model/validation/contracts/certificate-events";
import { MarketEvent } from "@trading-model/validation/contracts/market-events";

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

import type { AuditEventMap } from "@trading-model/validation/contracts/audit-events";
import type { CertificateEventMap } from "@trading-model/validation/contracts/certificate-events";
import type { MarketEventMap } from "@trading-model/validation/contracts/market-events";

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
