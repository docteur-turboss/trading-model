import { randomUUID } from "node:crypto";
import { HELPER } from "@trading-model/broker-message";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { MarketEvent } from "@trading-model/contracts/market-events";
import type { Signature } from "@trading-model/contracts/signed-request";
import { sha256Base64url } from "@trading-model/crypto/adapters/outbound/node-hash";
import {
	toCorrelationId,
	toInstanceId,
	toRole,
	toServiceId,
	toSubject,
	toTenantId,
	toTopic,
} from "@trading-model/primitives/primitives";
import { ENV } from "../../../infrastructure/config/env";

/**
 * Builds the metadata shared by the market data messages of one scrape cycle.
 * The builder validates topic, event type and publisher at construction: each
 * message then overrides topic and event type (market-data-sender).
 */
export function createMarketDataMetadata(
	deliveryMode?: DeliveryMode
): typeof HELPER.metadataBuilder.prototype {
	const authContext = {
		roles: ["Data", "Financial", "Scraper"].map(toRole),
		subject: toSubject(ENV.SERVICE_NAME),
		tenantId: toTenantId(ENV.INSTANCE_ID),
	};
	const signature = sha256Base64url(deterministicStringify(authContext));

	return new HELPER.metadataBuilder(
		toTopic(MarketEvent.FetchCandlestickSeries),
		MarketEvent.FetchCandlestickSeries,
		{
			instanceId: toInstanceId(ENV.INSTANCE_ID),
			serviceName: toServiceId(ENV.SERVICE_NAME),
		}
	)
		.setDelivery({ mode: deliveryMode ?? DeliveryMode.AtLeastOnce })
		.setSecurity({ authContext, signature: signature as Signature })
		.setIds({
			causationId: toCorrelationId(randomUUID()),
			correlationId: toCorrelationId(randomUUID()),
		});
}
