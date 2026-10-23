import type { MessageMetadata } from "@trading-model/contracts/message-types";

export interface IPublishClient {
	publish<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void>;
}
