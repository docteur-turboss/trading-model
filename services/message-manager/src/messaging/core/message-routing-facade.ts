import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { ClaimExecutor } from "./claim-executor";
import { DeduplicationService } from "./deduplication-service";
import type {
	AckRef,
	ClaimParams,
	DedupConfig,
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
	): Promise<
		import("@trading-model/validation/contracts/message.types").Message[]
	>;
	getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<
		import("@trading-model/validation/contracts/message.types").Message[]
	>;
	getStreamLag(ref: StreamGroupRef): Promise<number>;
}

export interface IPendingAckOps {
	recoverPendingAcks(
		ownInstanceId: InstanceId,
		maxAgeMs?: number
	): Promise<number>;
	addPendingAck(
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void>;
	removePendingAck(instanceId: InstanceId, messageId: string): Promise<void>;
	getPendingAcks(
		instanceId: InstanceId
	): Promise<Record<string, PendingAckData>>;
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

	constructor(keys: RedisKeyBuilder) {
		this._streamOps = new StreamGroupOperations(keys);
		this._pendingAckOps = new PendingAckOperations(keys);
		this._claimManager = new ClaimExecutor(keys);
		this._dedupService = new DeduplicationService(keys);
	}

	recoverPendingAcks(
		ownInstanceId: InstanceId,
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
		import("@trading-model/validation/contracts/message.types").Message[]
	> {
		return this._streamOps.getMessagesAfter(query);
	}

	getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<
		import("@trading-model/validation/contracts/message.types").Message[]
	> {
		return this._streamOps.getMessagesBetween(params);
	}

	async addPendingAck(
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		await this._pendingAckOps.addPendingAck(instanceId, messageId, data);
	}

	async removePendingAck(
		instanceId: InstanceId,
		messageId: string
	): Promise<void> {
		await this._pendingAckOps.removePendingAck(instanceId, messageId);
	}

	getPendingAcks(
		instanceId: InstanceId
	): Promise<Record<string, PendingAckData>> {
		return this._pendingAckOps.getPendingAcks(instanceId);
	}

	getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._streamOps.getStreamLag(ref);
	}

	tryDeduplicate(params: DedupConfig): Promise<boolean> {
		return this._dedupService.tryDeduplicate(
			params.deduplicationId,
			params.ttlS
		);
	}
}
