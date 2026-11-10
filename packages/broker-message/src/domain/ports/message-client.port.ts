import type { MessageMetadata } from "@trading-model/contracts/message-types";

export interface MessageClientPort {
	publish<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void>;
	subscribe(topics: readonly string[]): Promise<void>;
	unsubscribe(topics: readonly string[]): Promise<void>;
}
