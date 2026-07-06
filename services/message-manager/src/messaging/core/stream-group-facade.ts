import type { Message } from "@trading-model/common/contracts/message.types";
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

	async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
		await this._streamGroupManager.ensureConsumerGroup(topic, groupName);
	}

	async readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroupManager.readFromGroup(params);
	}

	async ackMessage(
		topic: string,
		groupName: string,
		messageId: string
	): Promise<void> {
		await this._streamGroupManager.ackMessage(topic, groupName, messageId);
	}

	async getPendingCount(topic: string, groupName: string): Promise<number> {
		return this._streamGroupManager.getPendingCount(topic, groupName);
	}

	async getMessagesAfter(
		topic: string,
		afterTimestamp: number,
		limit = 100
	): Promise<Message[]> {
		return this._streamGroupManager.getMessagesAfter(
			topic,
			afterTimestamp,
			limit
		);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._streamGroupManager.getMessagesBetween(params);
	}

	async getStreamLag(topic: string, groupName: string): Promise<number> {
		return this._streamGroupManager.getStreamLag(topic, groupName);
	}
}
