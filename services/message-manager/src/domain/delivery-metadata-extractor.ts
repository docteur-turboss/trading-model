import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type { Message } from "@trading-model/contracts/message-types";
import {
	DurationMs,
	type SequenceNumber,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { DeliveryParams } from "./delivery-params";

interface SubscribersContext {
	deliveryAttempt: SequenceNumber;
	ack(): Promise<void>;
}

export type { SubscribersContext };

export function extractDeliveryParams<TData>(
	message: Message<TData>
): DeliveryParams {
	const ttl = DurationMs.of(message.metadata.delivery?.ttl ?? 0);
	const deliveryMode =
		message.metadata.delivery?.mode ?? DeliveryMode.AtLeastOnce;
	const emittedAt = UnixTimestamp.of(
		new Date(message.metadata.emittedAt ?? 0).getTime()
	);
	return { ttl, deliveryMode, emittedAt };
}

export function buildSubscriberContext(onAck: () => void): SubscribersContext {
	return {
		deliveryAttempt: 0 as SequenceNumber,
		ack: () => {
			onAck();
			return Promise.resolve();
		},
	};
}
