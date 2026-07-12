import type { Message } from "@trading-model/validation/contracts/message.types";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";
import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";
import { StreamGroupManager } from "./stream-group-manager";

export class StreamGroupFacade {
	private readonly _streamGroupManager: StreamGroupManager;

	constructor(keys: RedisKeyBuilder) {
		this._streamGroupManager = new StreamGroupManager(keys);
	}

	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		await this._streamGroupManager.ensureConsumerGroup(ref);
	}

	readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroupManager.readFromGroup(params);
	}

	async ackMessage(ref: AckRef): Promise<void> {
		await this._streamGroupManager.ackMessage(ref);
	}

	getPendingCount(ref: StreamGroupRef): Promise<number> {
		return this._streamGroupManager.getPendingCount(ref);
	}

	getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		return this._streamGroupManager.getMessagesAfter(query);
	}

	getMessagesBetween(params: GetMessagesBetweenParams): Promise<Message[]> {
		return this._streamGroupManager.getMessagesBetween(params);
	}

	getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._streamGroupManager.getStreamLag(ref);
	}
}
