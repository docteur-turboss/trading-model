import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import {
	DurationMs,
	type SequenceNumber,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { DeliveryParams } from "./delivery-params";

interface SubscribersContext {
	consumerGroup: string;
	deliveryAttempt: SequenceNumber;
	ack(): Promise<void>;
}

export type { SubscribersContext };

export class DeliveryMetadataExtractor {
	extract<TData>(message: Message<TData>): DeliveryParams {
		const ttl = DurationMs.of(message.metadata.delivery?.ttl ?? 0);
		const deliveryMode =
			message.metadata.delivery?.mode ?? DeliveryMode.AtLeastOnce;
		const emittedAt = UnixTimestamp.of(
			new Date(message.metadata.emittedAt ?? 0).getTime()
		);
		return { ttl, deliveryMode, emittedAt };
	}

	buildSubscriberContext(
		serviceName: ServiceInstanceName,
		onAck: () => void
	): SubscribersContext {
		return {
			consumerGroup: serviceName,
			deliveryAttempt: 0 as SequenceNumber,
			ack: () => {
				onAck();
				return Promise.resolve();
			},
		};
	}
}
