import { HELPER } from "@trading-model/broker-message";
import type { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { MarketEvent } from "@trading-model/contracts/market-events";
import type { Signature } from "@trading-model/contracts/signed-request";
import { toTopic } from "@trading-model/primitives/primitives";
import {
	buildAuthContext,
	buildDeliveryConfig,
	buildIds,
	buildPublisher,
	computeSignature,
} from "./message-builder";

/**
 * Builds the metadata shared by the market data messages of one scrape cycle.
 * The builder validates topic, event type and publisher at construction: each
 * message then overrides topic and event type (market-data-sender).
 */
export function createMarketDataMetadata(
	deliveryMode?: DeliveryMode
): typeof HELPER.metadataBuilder.prototype {
	const authContext = buildAuthContext();
	const signature = computeSignature(authContext);

	return new HELPER.metadataBuilder(
		toTopic(MarketEvent.FetchCandlestickSeries),
		MarketEvent.FetchCandlestickSeries,
		buildPublisher()
	)
		.setDelivery(buildDeliveryConfig(deliveryMode))
		.setSecurity({ authContext, signature: signature as Signature })
		.setIds(buildIds());
}
