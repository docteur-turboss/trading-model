import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";

export interface DeliveryParams {
	ttl: number;
	emittedAt: number;
	deliveryMode: DeliveryMode;
}
