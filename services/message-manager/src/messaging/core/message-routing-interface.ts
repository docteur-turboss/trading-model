import type { Message } from "@trading-model/common/contracts/message.types";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";

export interface IMessageRouting {
	recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs?: number
	): Promise<number>;
	claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs?: number,
		count?: number
	): Promise<number>;
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
	addPendingAck(
		instanceId: string,
		messageId: string,
		data: {
			topic: string;
			subscriberUrl: string;
			message: Message;
		}
	): Promise<void>;
	removePendingAck(instanceId: string, messageId: string): Promise<void>;
	getPendingAcks(
		instanceId: string
	): Promise<
		Record<
			string,
			{
				topic: string;
				subscriberUrl: string;
				message: Message;
			}
		>
	>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
	tryDeduplicate(deduplicationId: string, ttlS: number): Promise<boolean>;
}
