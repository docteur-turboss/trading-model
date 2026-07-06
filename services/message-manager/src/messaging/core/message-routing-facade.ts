import type { Message } from "@trading-model/common/contracts/message.types";
import { ClaimManager } from "./claim-manager";
import { DeduplicationService } from "./deduplication-service";
import { PendingAckFacade } from "./pending-ack-facade";
import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";
import { StreamGroupFacade } from "./stream-group-facade";

export class MessageRoutingFacade {
	private readonly _streamGroup: StreamGroupFacade;
	private readonly _pendingAck: PendingAckFacade;
	private readonly _claimManager: ClaimManager;
	private readonly _dedupService: DeduplicationService;

	constructor(prefix: string) {
		this._streamGroup = new StreamGroupFacade(prefix);
		this._pendingAck = new PendingAckFacade(prefix);
		this._claimManager = new ClaimManager(prefix);
		this._dedupService = new DeduplicationService(prefix);
	}

	async recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._pendingAck.recoverStale(ownInstanceId, maxAgeMs);
	}

	async claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs = 60_000,
		count = 100
	): Promise<number> {
		return this._claimManager.claimPendingMessages(
			groupName,
			consumerId,
			minIdleMs,
			count
		);
	}

	async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
		await this._streamGroup.ensureConsumerGroup(topic, groupName);
	}

	async readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroup.readFromGroup(params);
	}

	async ackMessage(
		topic: string,
		groupName: string,
		messageId: string
	): Promise<void> {
		await this._streamGroup.ackMessage(topic, groupName, messageId);
	}

	async getPendingCount(topic: string, groupName: string): Promise<number> {
		return this._streamGroup.getPendingCount(topic, groupName);
	}

	async getMessagesAfter(
		topic: string,
		afterTimestamp: number,
		limit = 100
	): Promise<Message[]> {
		return this._streamGroup.getMessagesAfter(
			topic,
			afterTimestamp,
			limit
		);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._streamGroup.getMessagesBetween(params);
	}

	async addPendingAck(
		instanceId: string,
		messageId: string,
		data: { topic: string; subscriberUrl: string; message: Message }
	): Promise<void> {
		await this._pendingAck.add(instanceId, messageId, data);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		await this._pendingAck.remove(instanceId, messageId);
	}

	async getPendingAcks(
		instanceId: string
	): Promise<
		Record<string, { topic: string; subscriberUrl: string; message: Message }>
	> {
		return this._pendingAck.getAll(instanceId);
	}

	async getStreamLag(topic: string, groupName: string): Promise<number> {
		return this._streamGroup.getStreamLag(topic, groupName);
	}

	async tryDeduplicate(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		return this._dedupService.tryDeduplicate(deduplicationId, ttlS);
	}
}
