import type { HELPER } from "@trading-model/broker-message";
import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { toTopic } from "@trading-model/common/domain/primitives";
import type { Signature } from "@trading-model/validation/adapters/inbound/signed-request";
import { MarketEvent } from "@trading-model/validation/domain/contracts/market-events";
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
		.setEventType(MarketEvent.FetchCandlestickSeries)
		.setTopic(toTopic(MarketEvent.FetchCandlestickSeries))
		.setSecurity({ authContext, signature: signature as Signature })
		.setIds(buildIds())
		.setPublisher(buildPublisher());
}
