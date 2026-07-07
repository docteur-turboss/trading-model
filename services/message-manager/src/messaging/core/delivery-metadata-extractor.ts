import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { Message } from "@trading-model/common/contracts/message.types";

interface SubscribersContext {
	consumerGroup: string;
	deliveryAttempt: number;
	ack(): Promise<void>;
}

export type { SubscribersContext };

export class DeliveryMetadataExtractor {
	extract<TData>(message: Message<TData>): {
		ttl: number;
		deliveryMode: DeliveryMode;
		emittedAt: number;
	} {
		const ttl = message.metadata.delivery?.ttl ?? 0;
		const deliveryMode =
			message.metadata.delivery?.mode ?? DeliveryMode.AT_LEAST_ONCE;
		const emittedAt = new Date(message.metadata.emittedAt ?? 0).getTime();
		return { ttl, deliveryMode, emittedAt };
	}

	buildSubscriberContext(
		serviceName: string,
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
