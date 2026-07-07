import { createHash, randomUUID } from "node:crypto";

import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { AuthContext } from "@trading-model/common/contracts/message.types";
import type {
	InstanceId,
	MessageId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import {
	toInstanceId,
	toMessageId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";

import { env } from "../../config/env";

export interface MarketDataEntry {
	data: unknown;
	topic: string;
	eventType: string;
}

export function makeEntry(
	data: unknown,
	topic: string,
	eventType: string
): MarketDataEntry {
	return { data, topic, eventType };
}

export function buildAuthContext(): AuthContext {
	return {
		roles: ["Data", "Financial", "Scraper"],
		subject: env.SERVICE_NAME,
		tenantId: env.INSTANCE_ID,
	};
}

export function computeSignature(authContext: unknown): string {
	return createHash("sha256")
		.update(deterministicStringify(authContext))
		.digest("base64url");
}

export function buildDeliveryConfig(deliveryMode?: DeliveryMode): {
	mode: DeliveryMode;
	deduplicationId: MessageId;
} {
	return {
		mode: deliveryMode ?? DeliveryMode.AT_LEAST_ONCE,
		deduplicationId: toMessageId(randomUUID()),
	};
}

export function buildIds(): { causationId: string; correlationId: string } {
	return {
		causationId: randomUUID(),
		correlationId: randomUUID(),
	};
}

export function buildPublisher(): {
	instanceId: InstanceId;
	serviceName: ServiceId;
} {
	return {
		instanceId: toInstanceId(env.INSTANCE_ID),
		serviceName: toServiceId(env.SERVICE_NAME),
	};
}
