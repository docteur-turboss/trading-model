import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";

export interface IStreamGroupOps {
	ensureConsumerGroup(ref: StreamGroupRef): Promise<void>;
	readFromGroup(
		params: import("./stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>>;
	ackMessage(ref: AckRef): Promise<void>;
	getPendingCount(ref: StreamGroupRef): Promise<number>;
	getMessagesAfter(query: MessageQuery): Promise<Message[]>;
	getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<Message[]>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
}
