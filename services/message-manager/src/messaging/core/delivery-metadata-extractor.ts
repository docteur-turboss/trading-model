import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import type { DeliveryParams } from "./delivery-params";

interface SubscribersContext {
	consumerGroup: string;
	deliveryAttempt: number;
	ack(): Promise<void>;
}

export type { SubscribersContext };

export class DeliveryMetadataExtractor {
	extract<TData>(message: Message<TData>): DeliveryParams {
		const ttl = message.metadata.delivery?.ttl ?? 0;
		const deliveryMode =
			message.metadata.delivery?.mode ?? DeliveryMode.AtLeastOnce;
		const emittedAt = new Date(message.metadata.emittedAt ?? 0).getTime();
		return { ttl, deliveryMode, emittedAt };
	}

	buildSubscriberContext(
		serviceName: ServiceInstanceName,
		onAck: () => void
	): SubscribersContext {
		return {
			consumerGroup: serviceName,
			deliveryAttempt: 0,
			ack: () => {
				onAck();
				return Promise.resolve();
			},
		};
	}
}
