import type { IPublishClient } from "./i-publish-client";

export interface IMessageClient extends IPublishClient {
	subscribe(topics: readonly string[]): Promise<void>;
	unsubscribe(topics: readonly string[]): Promise<void>;
}
