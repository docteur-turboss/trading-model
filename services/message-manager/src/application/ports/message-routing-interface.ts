import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import type {
	AckRef,
	ClaimParams,
	DedupConfig,
	MessageQuery,
	StreamGroupRef,
} from "../../messaging/core/messaging-types";
import type { IPendingAckOps } from "../../messaging/core/pending-ack-ops-interface";

export interface IMessageRouting extends IPendingAckOps {
	claimPendingMessages(params: ClaimParams): Promise<number>;
	ensureConsumerGroup(ref: StreamGroupRef): Promise<void>;
	readFromGroup(
		params: import("../../messaging/core/stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>>;
	ackMessage(ref: AckRef): Promise<void>;
	getPendingCount(ref: StreamGroupRef): Promise<number>;
	getMessagesAfter(query: MessageQuery): Promise<Message[]>;
	getMessagesBetween(
		params: import("../../messaging/core/stream-group-manager").GetMessagesBetweenParams
	): Promise<Message[]>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
	tryDeduplicate(params: DedupConfig): Promise<boolean>;
}
