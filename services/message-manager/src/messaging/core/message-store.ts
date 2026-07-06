import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { ClaimManager } from "./claim-manager";
import { DeduplicationService } from "./deduplication-service";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { MessageStreamWriter } from "./message-stream-writer";
import { PendingAckStore } from "./pending-ack-store";
import {
	type GetMessagesBetweenParams,
	type ReadFromGroupParams,
	StreamGroupManager,
} from "./stream-group-manager";
import { WalFlusherService } from "./wal-flusher-service";

export class MessageStore {
	private readonly _prefix: string;
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _pendingAckStore: PendingAckStore;
	private readonly _claimManager: ClaimManager;
	private readonly _dedupService: DeduplicationService;
	private readonly _streamGroupManager: StreamGroupManager;
	private readonly _walFlusher: WalFlusherService;
	private readonly _streamWriter: MessageStreamWriter;

	constructor() {
		this._prefix = ENV.REDIS_PREFIX;
		this._memoryWalBuffer = new MemoryWalBuffer(this._prefix);
		this._pendingAckStore = new PendingAckStore(this._prefix);
		this._claimManager = new ClaimManager(this._prefix);
		this._dedupService = new DeduplicationService(this._prefix);
		this._streamGroupManager = new StreamGroupManager(this._prefix);
		this._walFlusher = new WalFlusherService(
			this._prefix,
			this._memoryWalBuffer
		);
		this._streamWriter = new MessageStreamWriter(
			this._prefix,
			this._walFlusher
		);
		this._walFlusher.start();
		this._memoryWalBuffer.startFlusher();
	}

	async store(topic: string, message: Message): Promise<string> {
		return this._streamWriter.store(topic, message);
	}

	async drainAndStop(timeoutMs = 10_000): Promise<void> {
		await this._walFlusher.drainAndStop(timeoutMs);
	}

	stop(): void {
		this._walFlusher.stop();
		this._memoryWalBuffer.stopFlusher();
	}

	async recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._pendingAckStore.recoverStale(ownInstanceId, maxAgeMs);
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

	async drainWalOnStartup(): Promise<void> {
		await this._walFlusher.drainOnStartup();
	}

	async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
		await this._streamGroupManager.ensureConsumerGroup(topic, groupName);
	}

	async readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._streamGroupManager.readFromGroup(params);
	}

	async ackMessage(
		topic: string,
		groupName: string,
		messageId: string
	): Promise<void> {
		await this._streamGroupManager.ackMessage(topic, groupName, messageId);
	}

	async getPendingCount(topic: string, groupName: string): Promise<number> {
		return this._streamGroupManager.getPendingCount(topic, groupName);
	}

	async getMessagesAfter(
		topic: string,
		afterTimestamp: number,
		limit = 100
	): Promise<Message[]> {
		return this._streamGroupManager.getMessagesAfter(
			topic,
			afterTimestamp,
			limit
		);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._streamGroupManager.getMessagesBetween(params);
	}

	async addPendingAck(
		instanceId: string,
		messageId: string,
		data: { topic: string; subscriberUrl: string; message: Message }
	): Promise<void> {
		await this._pendingAckStore.add(instanceId, messageId, data);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		await this._pendingAckStore.remove(instanceId, messageId);
	}

	async getPendingAcks(
		instanceId: string
	): Promise<
		Record<string, { topic: string; subscriberUrl: string; message: Message }>
	> {
		return this._pendingAckStore.getAll(instanceId);
	}

	async getStreamLag(topic: string, groupName: string): Promise<number> {
		return this._streamGroupManager.getStreamLag(topic, groupName);
	}

	async tryDeduplicate(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		return this._dedupService.tryDeduplicate(deduplicationId, ttlS);
	}

	async drainWal(timeoutMs = 10_000): Promise<void> {
		await this._walFlusher.drain(timeoutMs);
	}
}

export const messageStore = new MessageStore();
