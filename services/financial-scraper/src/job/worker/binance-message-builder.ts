import { createHash, randomUUID } from "node:crypto";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { AuthContext } from "@trading-model/common/contracts/message.types";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import type {
	CorrelationId,
	InstanceId,
	MessageId,
	ServiceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toRole,
	toServiceId,
	toSubject,
	toTenantId,
} from "@trading-model/common/domain/primitives";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";

import { ENV } from "../../config/env";

export interface MarketDataEntry {
	data: unknown;
	topic: Topic;
	eventType: EventEnumMap;
}

export function makeEntry(
	data: unknown,
	topic: Topic,
	eventType: EventEnumMap
): MarketDataEntry {
	return { data, topic, eventType };
}

export function buildAuthContext(): AuthContext {
	return {
		roles: ["Data", "Financial", "Scraper"].map(toRole),
		subject: toSubject(ENV.SERVICE_NAME),
		tenantId: toTenantId(ENV.INSTANCE_ID),
	};
}

export function computeSignature(authContext: unknown): string {
	return createHash(CryptoAlg.SHA256)
		.update(deterministicStringify(authContext))
		.digest(CryptoAlg.BASE64URL);
}

export function buildDeliveryConfig(deliveryMode?: DeliveryMode): {
	mode: DeliveryMode;
	deduplicationId: MessageId;
} {
	return {
		mode: deliveryMode ?? DeliveryMode.AtLeastOnce,
		deduplicationId: toMessageId(randomUUID()),
	};
}

export function buildIds(): {
	causationId: CorrelationId;
	correlationId: CorrelationId;
} {
	return {
		causationId: toCorrelationId(randomUUID()),
		correlationId: toCorrelationId(randomUUID()),
	};
}

export function buildPublisher(): {
	instanceId: InstanceId;
	serviceName: ServiceId;
} {
	return {
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		serviceName: toServiceId(ENV.SERVICE_NAME),
	};
}
