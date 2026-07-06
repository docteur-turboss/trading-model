import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import { getStreamClient } from "../../config/redis";
import { ClaimManager } from "./claim-manager";
import { DeduplicationService } from "./deduplication-service";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { PendingAckStore } from "./pending-ack-store";
import { StreamGroupManager, type ReadFromGroupParams } from "./stream-group-manager";
import { WalFlusherService } from "./wal-flusher-service";

const MAX_WAL_RETRY = 10;
const STORE_OPERATION_TIMEOUT_MS = 15_000;

export class MessageStore {
	private readonly _prefix: string;
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _pendingAckStore: PendingAckStore;
	private readonly _claimManager: ClaimManager;
	private readonly _dedupService: DeduplicationService;
	private readonly _streamGroupManager: StreamGroupManager;
	private readonly _walFlusher: WalFlusherService;

	constructor() {
		this._prefix = ENV.REDIS_PREFIX;
		this._memoryWalBuffer = new MemoryWalBuffer(this._prefix);
		this._pendingAckStore = new PendingAckStore(this._prefix);
		this._claimManager = new ClaimManager(this._prefix);
		this._dedupService = new DeduplicationService(this._prefix);
		this._streamGroupManager = new StreamGroupManager(this._prefix);
		this._walFlusher = new WalFlusherService(this._prefix, this._memoryWalBuffer);
		this._walFlusher.start();
		this._memoryWalBuffer.startFlusher();
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	private async _tryStoreOnce(
		topic: string,
		serialized: string,
		redis: Redis
	): Promise<string> {
		const entryId = await redis.xadd(
			this._streamKey(topic),
			"MAXLEN",
			"~",
			ENV.REDIS_STREAM_MAXLEN,
			"*",
			"data",
			serialized
		);
		await redis.expire(this._streamKey(topic), ENV.REDIS_MESSAGE_TTL_S);
		return entryId ?? "";
	}

	private _isStoreTimedOut(
		storeStart: number,
		attempt: number,
		topic: string
	): boolean {
		if (Date.now() - storeStart <= STORE_OPERATION_TIMEOUT_MS) {
			return false;
		}
		logger.error("Stream store timed out — falling through to WAL", {
			topic,
			attempt,
			elapsed: Date.now() - storeStart,
		});
		return true;
	}

	private async _storeInRedisStream(
		topic: string,
		serialized: string
	): Promise<string | null> {
		const redis = await getStreamClient();
		const storeStart = Date.now();
		let attempt = 0;
		let lastError: Error | null = null;

		while (attempt < MAX_WAL_RETRY) {
			if (this._isStoreTimedOut(storeStart, attempt, topic)) {
				break;
			}
			try {
				return await this._tryStoreOnce(topic, serialized, redis);
			} catch (err) {
				attempt++;
				lastError = err as Error;
				const backoff = Math.min(100 * 2 ** attempt, 5000);
				logger.warn("Redis xadd failed, retrying", { context: {
					topic,
					attempt,
					backoff,
					error: (err as Error).message,
				} });
				await this._sleepWithJitter(backoff);
			}
		}

		if (lastError) {
			logger.warn(
				"Stream store failed after retries — falling through to WAL",
				{
					topic,
					attempt,
					error: lastError.message,
				}
			);
		}

		return null;
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}

	async store(topic: string, message: Message): Promise<string> {
		const serialized = safeStringify(message);

		if (serialized.length > ENV.MAX_PAYLOAD_BYTES) {
			logger.error("Message payload exceeds maximum size", { context: {
				topic,
				size: serialized.length,
				max: ENV.MAX_PAYLOAD_BYTES,
			} });
			MESSAGES_DLQ_TOTAL.inc({ topic, reason: "PAYLOAD_TOO_LARGE" });
			return "payload-too-large";
		}

		const entryId = await this._storeInRedisStream(topic, serialized);
		if (entryId !== null) {
			return entryId;
		}

		try {
			await this._walFlusher.storeInWal(topic, serialized);
		} catch (err) {
			logger.warn("Redis WAL list write failed, writing to in-memory buffer", { context: {
				topic,
				error: (err as Error).message,
			} });
			this._walFlusher.bufferInMemory(topic, serialized, message);
			return "memory-buffered";
		}

		this._walFlusher.flush().catch(() => {});
		return "wal-buffered";
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
		return this._streamGroupManager.getMessagesAfter(topic, afterTimestamp, limit);
	}

	async getMessagesBetween(
		topic: string,
		fromMs: number,
		toMs: number,
		limit = 100
	): Promise<Message[]> {
		return this._streamGroupManager.getMessagesBetween(
			topic,
			fromMs,
			toMs,
			limit
		);
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
