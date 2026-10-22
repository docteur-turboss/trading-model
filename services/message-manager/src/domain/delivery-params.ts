import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type {
	DurationMs,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

export interface DeliveryParams {
	ttl: DurationMs;
	emittedAt: UnixTimestamp;
	deliveryMode: DeliveryMode;
}
