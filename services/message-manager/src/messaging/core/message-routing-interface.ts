import type { Message } from "@trading-model/common/contracts/message.types";
import type { AckRef, ClaimParams, MessageQuery, PendingAckData, StreamGroupRef } from "./messaging-types";

export interface IMessageRouting {
	recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs?: number
	): Promise<number>;
	claimPendingMessages(
		params: ClaimParams
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
		data: PendingAckData
	): Promise<void>;
	removePendingAck(instanceId: string, messageId: string): Promise<void>;
	getPendingAcks(
		instanceId: string
	): Promise<
		Record<string, PendingAckData>
	>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
	tryDeduplicate(deduplicationId: string, ttlS: number): Promise<boolean>;
}
