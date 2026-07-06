import type { Message } from "@trading-model/common/contracts/message.types";

import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";
import { StreamGroupFacade } from "./stream-group-facade";

export class StreamGroupOperations {
	private readonly _streamGroup: StreamGroupFacade;

	constructor(prefix: string) {
		this._streamGroup = new StreamGroupFacade(prefix);
	}

	async ensureConsumerGroup(
		topic: string,
		groupName: string,
	): Promise<void> {
		await this._streamGroup.ensureConsumerGroup(topic, groupName);
	}

	async readFromGroup(
		params: ReadFromGroupParams,
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroup.readFromGroup(params);
	}

	async ackMessage(
		topic: string,
		groupName: string,
		messageId: string,
	): Promise<void> {
		await this._streamGroup.ackMessage(topic, groupName, messageId);
	}

	async getPendingCount(
		topic: string,
		groupName: string,
	): Promise<number> {
		return this._streamGroup.getPendingCount(topic, groupName);
	}

	async getMessagesAfter(
		topic: string,
		afterTimestamp: number,
		limit = 100,
	): Promise<Message[]> {
		return this._streamGroup.getMessagesAfter(topic, afterTimestamp, limit);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams,
	): Promise<Message[]> {
		return this._streamGroup.getMessagesBetween(params);
	}

	async getStreamLag(
		topic: string,
		groupName: string,
	): Promise<number> {
		return this._streamGroup.getStreamLag(topic, groupName);
	}
}
