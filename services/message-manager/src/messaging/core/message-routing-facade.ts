import { ClaimExecutor } from "./claim-executor";
import { DeduplicationService } from "./deduplication-service";
import type {
	AckRef,
	ClaimParams,
	MessageQuery,
	PendingAckData,
	StreamGroupRef,
} from "./messaging-types";
import { PendingAckOperations } from "./pending-ack-operations";
import { StreamGroupOperations } from "./stream-group-operations";

export interface IStreamGroupOps {
	ensureConsumerGroup(ref: StreamGroupRef): Promise<void>;
	readFromGroup(
		params: import("./stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>>;
	ackMessage(ref: AckRef): Promise<void>;
	getPendingCount(ref: StreamGroupRef): Promise<number>;
	getMessagesAfter(
		query: MessageQuery
	): Promise<import("@trading-model/common/contracts/message.types").Message[]>;
	getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<import("@trading-model/common/contracts/message.types").Message[]>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
}

export interface IPendingAckOps {
	recoverPendingAcks(ownInstanceId: string, maxAgeMs?: number): Promise<number>;
	addPendingAck(
		instanceId: string,
		messageId: string,
		data: PendingAckData
	): Promise<void>;
	removePendingAck(instanceId: string, messageId: string): Promise<void>;
	getPendingAcks(instanceId: string): Promise<Record<string, PendingAckData>>;
}

export interface IClaimOps {
	claimPendingMessages(params: ClaimParams): Promise<number>;
}

export interface IDedupOps {
	tryDeduplicate(deduplicationId: string, ttlS: number): Promise<boolean>;
}

export class MessageRoutingFacade {
	private readonly _streamOps: StreamGroupOperations;
	private readonly _pendingAckOps: PendingAckOperations;
	private readonly _claimManager: ClaimExecutor;
	private readonly _dedupService: DeduplicationService;

	constructor(prefix: string) {
		this._streamOps = new StreamGroupOperations(prefix);
		this._pendingAckOps = new PendingAckOperations(prefix);
		this._claimManager = new ClaimExecutor(prefix);
		this._dedupService = new DeduplicationService(prefix);
	}

	get streamOps(): StreamGroupOperations {
		return this._streamOps;
	}

	get pendingAckOps(): PendingAckOperations {
		return this._pendingAckOps;
	}

	get claimManager(): ClaimExecutor {
		return this._claimManager;
	}

	get dedupService(): DeduplicationService {
		return this._dedupService;
	}

	recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._pendingAckOps.recoverPendingAcks(ownInstanceId, maxAgeMs);
	}

	claimPendingMessages(params: ClaimParams): Promise<number> {
		return this._claimManager.claimPendingMessages(params);
	}

	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		await this._streamOps.ensureConsumerGroup(ref);
	}

	readFromGroup(
		params: import("./stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamOps.readFromGroup(params);
	}

	async ackMessage(ref: AckRef): Promise<void> {
		await this._streamOps.ackMessage(ref);
	}

	getPendingCount(ref: StreamGroupRef): Promise<number> {
		return this._streamOps.getPendingCount(ref);
	}

	getMessagesAfter(
		query: MessageQuery
	): Promise<
		import("@trading-model/common/contracts/message.types").Message[]
	> {
		return this._streamOps.getMessagesAfter(query);
	}

	getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<
		import("@trading-model/common/contracts/message.types").Message[]
	> {
		return this._streamOps.getMessagesBetween(params);
	}

	async addPendingAck(
		instanceId: string,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		await this._pendingAckOps.addPendingAck(instanceId, messageId, data);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		await this._pendingAckOps.removePendingAck(instanceId, messageId);
	}

	getPendingAcks(instanceId: string): Promise<Record<string, PendingAckData>> {
		return this._pendingAckOps.getPendingAcks(instanceId);
	}

	getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._streamOps.getStreamLag(ref);
	}

	tryDeduplicate(params: DedupConfig): Promise<boolean> {
		return this._dedupService.tryDeduplicate(params);
	}
}
