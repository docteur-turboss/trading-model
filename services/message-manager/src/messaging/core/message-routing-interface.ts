import type { Message } from "@trading-model/common/contracts/message.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type {
	AckRef,
	ClaimParams,
	DedupConfig,
	MessageQuery,
	PendingAckData,
	StreamGroupRef,
} from "./messaging-types";

export interface IMessageRouting {
	recoverPendingAcks(
		ownInstanceId: InstanceId,
		maxAgeMs?: number
	): Promise<number>;
	claimPendingMessages(params: ClaimParams): Promise<number>;
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
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void>;
	removePendingAck(instanceId: InstanceId, messageId: string): Promise<void>;
	getPendingAcks(
		instanceId: InstanceId
	): Promise<Record<string, PendingAckData>>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
	tryDeduplicate(params: DedupConfig): Promise<boolean>;
}
