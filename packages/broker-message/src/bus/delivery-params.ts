import type {
	DurationMs,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

export interface DeliveryParams {
	ttl: DurationMs;
	emittedAt: UnixTimestamp;
}
