import type { AuditEvent, AuditEventMap } from "./audit-events";
import type { MarketEvent, MarketEventMap } from "./market-events";
import type { TrainingEvent, TrainingEventMap } from "./training-events";

/** Union interface combining all per-context event maps. */
export interface EventMap
	extends MarketEventMap,
		AuditEventMap,
		TrainingEventMap {}

/** Union of all valid event message string values. */
export type EventEnumMap =
	| `${MarketEvent}`
	| `${AuditEvent}`
	| `${TrainingEvent}`;

/** Extracts the payload type for a given event message. */
export type EventMessagesArgs<TValue extends EventEnumMap> =
	TValue extends keyof EventMap ? EventMap[TValue] : never;
