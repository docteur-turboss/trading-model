import type { Message } from "@trading-model/common/contracts/message.types";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";
import { StreamGroupFacade } from "./stream-group-facade";
import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";

export class StreamGroupOperations {
	private readonly _streamGroup: StreamGroupFacade;

	constructor(prefix: string) {
		this._streamGroup = new StreamGroupFacade(prefix);
	}

	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		await this._streamGroup.ensureConsumerGroup(ref);
	}

	async readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroup.readFromGroup(params);
	}

	async ackMessage(ref: AckRef): Promise<void> {
		await this._streamGroup.ackMessage(ref);
	}

	async getPendingCount(ref: StreamGroupRef): Promise<number> {
		return this._streamGroup.getPendingCount(ref);
	}

	async getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		return this._streamGroup.getMessagesAfter(query);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._streamGroup.getMessagesBetween(params);
	}

	async getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._streamGroup.getStreamLag(ref);
	}
}
