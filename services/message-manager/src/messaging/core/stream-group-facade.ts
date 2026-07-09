import type { Message } from "@trading-model/common/contracts/message.types";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";
import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";
import { StreamGroupManager } from "./stream-group-manager";

export class StreamGroupFacade {
	private readonly _streamGroupManager: StreamGroupManager;

	constructor(prefix: string) {
		this._streamGroupManager = new StreamGroupManager(prefix);
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
