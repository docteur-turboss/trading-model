import type { MessageMetadata } from "@trading-model/contracts/message-types";

/** Port of the message client used to publish and subscribe. */
export interface MessageClientPort {
	publish<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void>;
	subscribe(topics: readonly string[]): Promise<void>;
	unsubscribe(topics: readonly string[]): Promise<void>;
}
