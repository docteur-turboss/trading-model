import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import type {
	AckRef,
	GetMessagesBetweenParams,
	MessageQuery,
	ReadFromGroupParams,
	StreamGroupRef,
} from "../../domain/messaging-types";
import type { IStreamGroupOps } from "../../domain/stream-group-ops-interface";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { StreamGroupFacade } from "./stream-group-facade";

export class StreamGroupOperations implements IStreamGroupOps {
	private readonly _streamGroup: StreamGroupFacade;

	constructor(keys: RedisKeyBuilder) {
		this._streamGroup = new StreamGroupFacade(keys);
	}

	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		await this._streamGroup.ensureConsumerGroup(ref);
	}

	readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroup.readFromGroup(params);
	}

	async ackMessage(ref: AckRef): Promise<void> {
		await this._streamGroup.ackMessage(ref);
	}

	getPendingCount(ref: StreamGroupRef): Promise<number> {
		return this._streamGroup.getPendingCount(ref);
	}

	getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		return this._streamGroup.getMessagesAfter(query);
	}

	getMessagesBetween(params: GetMessagesBetweenParams): Promise<Message[]> {
		return this._streamGroup.getMessagesBetween(params);
	}

	getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._streamGroup.getStreamLag(ref);
	}
}
