import type { HELPER } from "@trading-model/broker-message";
import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { EnumEventMessage } from "@trading-model/common/config/event.types";
import {
	buildAuthContext,
	buildDeliveryConfig,
	buildIds,
	buildPublisher,
	computeSignature,
} from "./binance-worker-helpers";

export function configureMetadata(
	builder: typeof HELPER.metadataBuilder.prototype,
	deliveryMode?: DeliveryMode
): void {
	const authContext = buildAuthContext();
	const signature = computeSignature(authContext);

	builder
		.setDelivery(buildDeliveryConfig(deliveryMode))
		.setEventType("FetchCandlestick")
		.setTopic(EnumEventMessage.fetchCandlestickSeries)
		.setSecurity({ authContext, signature })
		.setIds(buildIds())
		.setPublisher(buildPublisher());
}
