import { ClaimManager } from "./claim-manager";
import { DeduplicationService } from "./deduplication-service";
import { PendingAckOperations } from "./pending-ack-operations";
import { StreamGroupOperations } from "./stream-group-operations";

export class MessageRoutingFacade {
	private readonly _streamOps: StreamGroupOperations;
	private readonly _pendingAckOps: PendingAckOperations;
	private readonly _claimManager: ClaimManager;
	private readonly _dedupService: DeduplicationService;
	constructor(prefix: string) {
		this._streamOps = new StreamGroupOperations(prefix);
		this._pendingAckOps = new PendingAckOperations(prefix);
		this._claimManager = new ClaimManager(prefix);
		this._dedupService = new DeduplicationService(prefix);
	}

	async recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._pendingAckOps.recoverPendingAcks(ownInstanceId, maxAgeMs);
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
		await this._streamOps.ensureConsumerGroup(topic, groupName);
	}

	async readFromGroup(
		params: import("./stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamOps.readFromGroup(params);
	}

	async ackMessage(
		topic: string,
		groupName: string,
		messageId: string
	): Promise<void> {
		await this._streamOps.ackMessage(topic, groupName, messageId);
	}

	async getPendingCount(topic: string, groupName: string): Promise<number> {
		return this._streamOps.getPendingCount(topic, groupName);
	}

	async getMessagesAfter(
		topic: string,
		afterTimestamp: number,
		limit = 100
	): Promise<import("@trading-model/common/contracts/message.types").Message[]> {
		return this._streamOps.getMessagesAfter(topic, afterTimestamp, limit);
	}

	async getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<import("@trading-model/common/contracts/message.types").Message[]> {
		return this._streamOps.getMessagesBetween(params);
	}

	async addPendingAck(
		instanceId: string,
		messageId: string,
		data: { topic: string; subscriberUrl: string; message: import("@trading-model/common/contracts/message.types").Message }
	): Promise<void> {
		await this._pendingAckOps.addPendingAck(instanceId, messageId, data);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		await this._pendingAckOps.removePendingAck(instanceId, messageId);
	}

	async getPendingAcks(
		instanceId: string
	): Promise<
		Record<string, { topic: string; subscriberUrl: string; message: import("@trading-model/common/contracts/message.types").Message }>
	> {
		return this._pendingAckOps.getPendingAcks(instanceId);
	}

	async getStreamLag(topic: string, groupName: string): Promise<number> {
		return this._streamOps.getStreamLag(topic, groupName);
	}
	async tryDeduplicate(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		return this._dedupService.tryDeduplicate(deduplicationId, ttlS);
	}
}
