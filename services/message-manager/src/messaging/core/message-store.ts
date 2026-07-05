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

const WAL_BATCH_SIZE = 50;
const MAX_WAL_RETRY = 10;
const WAL_LIST_MAX_LEN = 1_000_000;
const STORE_OPERATION_TIMEOUT_MS = 15_000;
const ATOMIC_WAL_READ_LUA = `
  local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
  if #entries > 0 then
    redis.call('LTRIM', KEYS[1], #entries, -1)
  end
  return entries
`;

export class MessageStore {
	private _prefix: string;
	private _walFlushing = false;
	private _walFlusherTimer: ReturnType<typeof setInterval> | null = null;
	private _walDrainRequested = false;
	private _walDrainResolve: (() => void) | null = null;
	private _walDrainGen = 0;
	private _memoryWalBuffer: MemoryWalBuffer;
	private _pendingAckStore: PendingAckStore;
	private readonly _claimManager: ClaimManager;
	private readonly _dedupService: DeduplicationService;

	constructor() {
		this._prefix = ENV.REDIS_PREFIX;
		this._memoryWalBuffer = new MemoryWalBuffer(this._prefix);
		this._pendingAckStore = new PendingAckStore(this._prefix);
		this._claimManager = new ClaimManager(this._prefix);
		this._dedupService = new DeduplicationService(this._prefix);
		this._startWalFlusher();
		this._memoryWalBuffer.startFlusher();
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	private _startWalFlusher(): void {
		this._walFlusherTimer = setInterval(() => {
			this._flushWal().catch(() => {});
		}, 1000);
		this._walFlusherTimer.unref();
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}

	async drainAndStop(timeoutMs = 10_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		try {
			const remaining = deadline - Date.now();
			if (remaining > 0) {
				await this.drainWal(remaining);
			}
		} catch (err) {
			logger.warn("WAL drain failed during shutdown", {
				error: (err as Error).message,
			});
		}
		while (this._memoryWalBuffer.length > 0) {
			if (Date.now() >= deadline) {
				logger.warn("Memory WAL drain timed out", {
					remaining: this._memoryWalBuffer.length,
				});
				break;
			}
			try {
				await this._memoryWalBuffer.drainAll();
			} catch {
				break;
			}
		}
		this.stop();
	}

	stop(): void {
		if (this._walFlusherTimer) {
			clearInterval(this._walFlusherTimer);
			this._walFlusherTimer = null;
		}
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
		try {
			await this._memoryWalBuffer.recoverFromFallbackFile();
		} catch {
			// best-effort
		}
		try {
			const redis = await getStreamClient();
			const len = await redis.llen(this._walKey());
			if (len > 0) {
				logger.info(
					`WAL buffer has ${len} pending entries from previous run — draining`
				);
				await this._flushWal();
			}
		} catch {
			// Redis not available — WAL will be drained when Redis is back
		}
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
				logger.warn("Redis xadd failed, retrying", {
					topic,
					attempt,
					backoff,
					error: (err as Error).message,
				});
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

	private async _storeInRedisWal(
		topic: string,
		serialized: string
	): Promise<void> {
		const redis = await getStreamClient();
		const walEntry = JSON.stringify({ topic, serialized });
		await redis.rpush(this._walKey(), walEntry);
		await redis.ltrim(this._walKey(), -WAL_LIST_MAX_LEN, -1);
		await redis.expire(this._walKey(), 7200);
	}

	async store(topic: string, message: Message): Promise<string> {
		const serialized = safeStringify(message);

		if (serialized.length > ENV.MAX_PAYLOAD_BYTES) {
			logger.error("Message payload exceeds maximum size", {
				topic,
				size: serialized.length,
				max: ENV.MAX_PAYLOAD_BYTES,
			});
			MESSAGES_DLQ_TOTAL.inc({ topic, reason: "PAYLOAD_TOO_LARGE" });
			return "payload-too-large";
		}

		const entryId = await this._storeInRedisStream(topic, serialized);
		if (entryId !== null) {
			return entryId;
		}

		try {
			await this._storeInRedisWal(topic, serialized);
		} catch (err) {
			logger.warn("Redis WAL list write failed, writing to in-memory buffer", {
				topic,
				error: (err as Error).message,
			});
			this._memoryWalBuffer.push(topic, serialized, message);
			return "memory-buffered";
		}

		this._flushWal().catch(() => {});
		return "wal-buffered";
	}

	private _walFlushWaiters: Array<() => void> = [];

	private _drainWalEntry(
		entry: string
	): { topic: string; data: string } | null {
		try {
			const parsed = JSON.parse(entry) as {
				topic: string;
				serialized?: string;
				message?: Message;
			};
			return {
				topic: parsed.topic,
				data: parsed.serialized ?? safeStringify(parsed.message!),
			};
		} catch {
			logger.warn("WAL flush: malformed entry dropped", {
				entry: entry.substring(0, 200),
			});
			return null;
		}
	}

	private async _flushWalBatch(raw: string[]): Promise<boolean> {
		const redis = await getStreamClient();
		const multi = redis.multi();
		for (const entry of raw) {
			const parsed = this._drainWalEntry(entry);
			if (!parsed) {
				continue;
			}
			const key = this._streamKey(parsed.topic);
			multi.xadd(
				key,
				"MAXLEN",
				"~",
				ENV.REDIS_STREAM_MAXLEN,
				"*",
				"data",
				parsed.data
			);
			multi.expire(key, ENV.REDIS_MESSAGE_TTL_S);
		}

		try {
			const results = await multi.exec();
			if (results) {
				const anyFailed = results.some((resultItem) => resultItem[0] !== null);
				if (anyFailed) {
					return false;
				}
			}
			return true;
		} catch {
			return false;
		}
	}

	private _bufferWalEntries(raw: string[]): void {
		for (const entry of raw) {
			try {
				const parsed = JSON.parse(entry) as {
					topic: string;
					serialized?: string;
					message?: Message;
				};
				const topic = parsed.topic;
				const serialized = parsed.serialized ?? safeStringify(parsed.message!);
				const message = parsed.message ?? JSON.parse(parsed.serialized!);
				this._memoryWalBuffer.push(topic, serialized, message);
			} catch {}
		}
	}

	private async _handleWalFlushError(
		raw: string[],
		consecutiveErrors: number
	): Promise<"retry" | "memory-buffer" | "abort"> {
		if (consecutiveErrors >= 5) {
			logger.error(
				"WAL flush: too many consecutive errors — switching to memory buffer"
			);
			this._bufferWalEntries(raw);
			return "memory-buffer";
		}

		if (raw.length > 0) {
			try {
				const redis = await getStreamClient();
				const restore = redis.multi();
				for (const entry of raw) {
					restore.rpush(this._walKey(), entry);
				}
				await restore.exec();
			} catch {
				this._bufferWalEntries(raw);
			}
		}

		return "retry";
	}

	private _completeWalFlush(): void {
		this._walFlushing = false;
		if (this._walDrainResolve) {
			const resolve = this._walDrainResolve;
			this._walDrainResolve = null;
			resolve();
		}
		const waiters = this._walFlushWaiters.splice(0);
		for (const waiter of waiters) {
			try {
				waiter();
			} catch {
				/* best-effort */
			}
		}
	}

	private async _flushWal(): Promise<void> {
		if (this._walFlushing) {
			return new Promise<void>((resolve) => {
				this._walFlushWaiters.push(resolve);
			});
		}
		this._walFlushing = true;

		try {
			const redis = await getStreamClient();
			let consecutiveErrors = 0;
			while (true) {
				const raw = (await redis.eval(
					ATOMIC_WAL_READ_LUA,
					1,
					this._walKey(),
					WAL_BATCH_SIZE.toString()
				)) as string[];
				if (raw.length === 0) {
					break;
				}

				const ok = await this._flushWalBatch(raw);
				if (ok) {
					consecutiveErrors = 0;
					continue;
				}

				consecutiveErrors++;
				logger.warn(
					"WAL flush pipeline: some commands failed — retrying batch",
					{
						consecutiveErrors,
						batchSize: raw.length,
					}
				);
				const action = await this._handleWalFlushError(raw, consecutiveErrors);
				const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30000);
				await this._sleepWithJitter(backoff);
				if (action === "abort") {
					break;
				}
				break;
			}
		} catch (err) {
			logger.error("WAL flush error", { error: (err as Error).message });
		} finally {
			this._completeWalFlush();
		}
	}

	async drainWal(timeoutMs = 10_000): Promise<void> {
		if (this._walDrainRequested) {
			return;
		}
		this._walDrainRequested = true;
		const gen = ++this._walDrainGen;

		try {
			await this._memoryWalBuffer.drainAll();
			const redis = await getStreamClient();
			const remaining = await redis.llen(this._walKey());
			if (remaining === 0 && this._memoryWalBuffer.length === 0) {
				return;
			}

			await this._flushWal();

			return new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					if (this._walDrainGen === gen) {
						this._walDrainResolve = null;
						logger.warn(`WAL drain timed out after ${timeoutMs}ms`);
						resolve();
					}
				}, timeoutMs);
				this._walDrainResolve = () => {
					if (this._walDrainGen === gen) {
						clearTimeout(timer);
						this._walDrainResolve = null;
						resolve();
					}
				};
			});
		} finally {
			this._walDrainRequested = false;
		}
	}

	async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
		const redis = await getStreamClient();
		try {
			await redis.xgroup(
				"CREATE",
				this._streamKey(topic),
				groupName,
				"$",
				"MKSTREAM"
			);
		} catch (err: unknown) {
			if (err instanceof Error && !err.message.includes("BUSYGROUP")) {
				logger.warn("Failed to create consumer group", {
					topic,
					groupName,
					error: err.message,
				});
			}
		}
	}

	async readFromGroup(
		topic: string,
		groupName: string,
		consumerId: string,
		count = 10,
		blockMs = 1000
	): Promise<Array<{ id: string; data: string }>> {
		const redis = await getStreamClient();
		const rawResult = await redis.xreadgroup(
			"GROUP",
			groupName,
			consumerId,
			"COUNT",
			count,
			"BLOCK",
			blockMs,
			"STREAMS",
			this._streamKey(topic),
			">"
		);
		if (!rawResult) {
			return [];
		}

		const result = rawResult as [string, [string, string[]][]][];
		const messages: Array<{ id: string; data: string }> = [];
		for (const [, entries] of result) {
			for (const [id, fields] of entries) {
				const dataIdx = fields.indexOf("data");
				if (dataIdx === -1) {
					continue;
				}
				messages.push({ id, data: fields[dataIdx + 1] });
			}
		}
		return messages;
	}

	async ackMessage(
		topic: string,
		groupName: string,
		messageId: string
	): Promise<void> {
		const redis = await getStreamClient();
		await redis.xack(this._streamKey(topic), groupName, messageId);
	}

	async getPendingCount(topic: string, groupName: string): Promise<number> {
		const redis = await getStreamClient();
		const rawResult = await redis.xpending(this._streamKey(topic), groupName);
		const result = rawResult as unknown as { pending: number };
		return (result?.pending as number) || 0;
	}

	async getMessagesAfter(
		topic: string,
		afterTimestamp: number,
		limit = 100
	): Promise<Message[]> {
		const redis = await getStreamClient();
		const minId = `${afterTimestamp}-0`;
		const results = await redis.xrange(
			this._streamKey(topic),
			minId,
			"+",
			"COUNT",
			limit
		);
		return results
			.map(([, fields]) => {
				const dataIdx = fields.indexOf("data");
				if (dataIdx === -1) {
					return null;
				}
				return JSON.parse(fields[dataIdx + 1]) as Message;
			})
			.filter(Boolean) as Message[];
	}

	async getMessagesBetween(
		topic: string,
		fromMs: number,
		toMs: number,
		limit = 100
	): Promise<Message[]> {
		const redis = await getStreamClient();
		const minId = `${fromMs}-0`;
		const maxId = `${toMs}-0`;
		const results = await redis.xrange(
			this._streamKey(topic),
			minId,
			maxId,
			"COUNT",
			limit
		);
		return results
			.map(([, fields]) => {
				const dataIdx = fields.indexOf("data");
				if (dataIdx === -1) {
					return null;
				}
				return JSON.parse(fields[dataIdx + 1]) as Message;
			})
			.filter(Boolean) as Message[];
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
		try {
			const redis = await getStreamClient();
			const info = (await redis.call(
				"XINFO",
				"GROUPS",
				this._streamKey(topic)
			)) as unknown[];
			for (const raw of info) {
				const group = raw as unknown[];
				if (String(group[1]) === groupName) {
					const lastDelivered = String(group[5] ?? "0-0");
					const lastTimestamp =
						Number.parseInt(lastDelivered.split("-")[0], 10) || 0;
					return Date.now() - lastTimestamp;
				}
			}
			return 0;
		} catch {
			return 0;
		}
	}

	async tryDeduplicate(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		return this._dedupService.tryDeduplicate(deduplicationId, ttlS);
	}
}

export const messageStore = new MessageStore();
