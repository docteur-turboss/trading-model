import type { Message } from "@trading-model/common/contracts/message.types";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import { retryFileAppend } from "@trading-model/common/utils/retry-file-append";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { BUFFER_DROPPED_TOTAL, MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import { getStreamClient } from "../../config/redis";

const WAL_BATCH_SIZE = 50;
const MAX_WAL_RETRY = 10;
const WAL_LIST_MAX_LEN = 1_000_000;
const WAL_FLUSH_RETRY_BASE_MS = 100;
const WAL_FLUSH_RETRY_MAX_MS = 10_000;
const STORE_OPERATION_TIMEOUT_MS = 15_000;
const MEMORY_WAL_REDIS_RETRY_AFTER_MS = 5_000;

interface MemoryWalEntry {
	topic: string;
	serialized: string;
	message: Message;
}

export class MessageStore {
	private _prefix: string;
	private _walFlushing = false;
	private _walFlusherTimer: ReturnType<typeof setInterval> | null = null;
	private _walDrainRequested = false;
	private _walDrainResolve: (() => void) | null = null;
	private _walDrainGen = 0;
	private _memoryWalBuffer: MemoryWalEntry[] = [];
	private _memoryWalFlusherTimer: ReturnType<typeof setInterval> | null = null;
	private _memoryWalBackoff = WAL_FLUSH_RETRY_BASE_MS;
	private _flushingMemoryWal = false;
	private _memoryWalRedisDownSince = 0;
	private _localDedupCache = new LruCache<boolean>(10000, 300_000);
	private _degradedDedupCache = new LruCache<boolean>(50000, 3600_000);

	constructor() {
		this._prefix = ENV.REDIS_PREFIX;
		this._startWalFlusher();
		this._startMemoryWalFlusher();
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	private _pendingKey(instanceId: string): string {
		return `${this._prefix}pending:${instanceId}`;
	}

	private _startWalFlusher(): void {
		this._walFlusherTimer = setInterval(() => {
			this._flushWal().catch(() => {});
		}, 1000);
		this._walFlusherTimer.unref();
	}

	private _startMemoryWalFlusher(): void {
		this._memoryWalFlusherTimer = setInterval(() => {
			this._flushMemoryWal().catch(() => {});
		}, 500);
		this._memoryWalFlusherTimer.unref();
	}

	private async _flushMemoryWal(): Promise<void> {
		if (this._flushingMemoryWal) {
			return;
		}
		if (
			this._memoryWalRedisDownSince > 0 &&
			Date.now() - this._memoryWalRedisDownSince <
				MEMORY_WAL_REDIS_RETRY_AFTER_MS
		) {
			return;
		}
		if (this._memoryWalBuffer.length === 0) {
			this._memoryWalBackoff = WAL_FLUSH_RETRY_BASE_MS;
			return;
		}

		this._flushingMemoryWal = true;

		try {
			const batch = this._memoryWalBuffer.splice(0, WAL_BATCH_SIZE);
			const redis = await getStreamClient();
			const multi = redis.multi();
			for (const { topic, serialized } of batch) {
				const key = this._streamKey(topic);
				multi.xadd(
					key,
					"MAXLEN",
					"~",
					ENV.REDIS_STREAM_MAXLEN,
					"*",
					"data",
					serialized
				);
				multi.expire(key, ENV.REDIS_MESSAGE_TTL_S);
			}
			try {
				const results = await multi.exec();
				if (results) {
					const anyFailed = results.some(
						(resultItem) => resultItem[0] !== null
					);
					if (anyFailed) {
						this._memoryWalRedisDownSince = Date.now();
						this._memoryWalBackoff = Math.min(
							this._memoryWalBackoff * 2,
							WAL_FLUSH_RETRY_MAX_MS
						);
						logger.warn("Memory WAL flush partial failure — re-queuing batch", {
							batchSize: batch.length,
							backoff: this._memoryWalBackoff,
						});
						this._memoryWalBuffer.unshift(...batch);
						await this._sleepWithJitter(this._memoryWalBackoff);
						return;
					}
				}
				this._memoryWalRedisDownSince = 0;
				this._memoryWalBackoff = WAL_FLUSH_RETRY_BASE_MS;
			} catch (err) {
				this._memoryWalRedisDownSince = Date.now();
				this._memoryWalBackoff = Math.min(
					this._memoryWalBackoff * 2,
					WAL_FLUSH_RETRY_MAX_MS
				);
				logger.warn("Memory WAL flush failed — re-queuing batch", {
					batchSize: batch.length,
					backoff: this._memoryWalBackoff,
					error: (err as Error).message,
				});
				this._memoryWalBuffer.unshift(...batch);
				await this._sleepWithJitter(this._memoryWalBackoff);
			}
		} finally {
			this._flushingMemoryWal = false;
		}
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
				await this._flushMemoryWal();
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
		if (this._memoryWalFlusherTimer) {
			clearInterval(this._memoryWalFlusherTimer);
			this._memoryWalFlusherTimer = null;
		}
	}

	async recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		try {
			const redis = await getStreamClient();
			const pendingKey = this._pendingKey(ownInstanceId);

			const toDelete: string[] = [];
			const now = Date.now();
			let cursor = "0";

			do {
				const [nextCursor, batch] = await redis.hscan(
					pendingKey,
					cursor,
					"COUNT",
					200
				);
				cursor = nextCursor;

				for (let i = 0; i < batch.length; i += 2) {
					const msgId = batch[i];
					const data = batch[i + 1];
					try {
						const entry = JSON.parse(data) as {
							topic: string;
							subscriberUrl: string;
							message: Message;
							pendingAt?: number;
						};
						const age =
							entry.pendingAt === undefined
								? now -
									new Date(entry.message.metadata.emittedAt ?? 0).getTime()
								: now - entry.pendingAt;
						if (age > maxAgeMs) {
							toDelete.push(msgId);
						}
					} catch {
						toDelete.push(msgId);
					}
				}
			} while (cursor !== "0");

			if (toDelete.length > 0) {
				await redis.hdel(pendingKey, ...toDelete);
				logger.info(
					`Recovered ${toDelete.length} stale pending acks for instance ${ownInstanceId}`
				);
			}
			return toDelete.length;
		} catch (err) {
			logger.warn("Failed to recover pending acks", {
				error: (err as Error).message,
			});
			return 0;
		}
	}

	async claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs = 60_000,
		count = 100
	): Promise<number> {
		const LockKey = `${this._prefix}claim-lock`;
		const LockTtlS = 30;
		let redis: Redis | null = null;
		try {
			redis = await getStreamClient();
			const acquired = await redis.set(
				LockKey,
				consumerId,
				"EX",
				LockTtlS,
				"NX"
			);
			if (!acquired) {
				logger.info(
					"claimPendingMessages: lock held by another instance — skipping"
				);
				return 0;
			}
			const topics: string[] = [];
			let cursor = "0";
			do {
				const [nextCursor, batch] = await redis.sscan(
					`${this._prefix}topics`,
					cursor,
					"COUNT",
					100
				);
				cursor = nextCursor;
				topics.push(...batch);
			} while (cursor !== "0");
			let total = 0;

			for (const topic of topics) {
				const streamKey = this._streamKey(topic);
				try {
					const pending = await redis.xpending(
						streamKey,
						groupName,
						"-",
						"+",
						count,
						consumerId
					);
					const pendingEntries = pending as [string, string, number, number][];
					const claimable = pendingEntries
						.filter(([, , , idleMs]) => idleMs >= minIdleMs)
						.map(([id]) => id);

					if (claimable.length > 0) {
						const claimed = await redis.xclaim(
							streamKey,
							groupName,
							consumerId,
							minIdleMs,
							...claimable
						);
						total += (claimed as unknown[]).length;
					}
				} catch {
					// stream or group may not exist yet
				}
			}

			if (total > 0) {
				logger.info(
					`Claimed ${total} pending messages for ${consumerId} across ${topics.length} topics`
				);
			}
			return total;
		} catch (err) {
			logger.warn("Failed to claim pending messages", {
				error: (err as Error).message,
			});
			return 0;
		} finally {
			if (redis) {
				// Only delete lock if we still own it (prevents stealing from another instance if our TTL expired)
				try {
					await redis.eval(
						"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
						1,
						LockKey,
						consumerId
					);
				} catch {
					/* best-effort */
				}
			}
		}
	}

	private async _recoverWalFromFallbackFile(): Promise<number> {
		try {
			const fs = await import("node:fs/promises");
			let content: string;
			try {
				content = await fs.readFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "utf-8");
			} catch {
				return 0;
			}
			if (!content) {
				return 0;
			}
			const lines = content.split("\n").filter(Boolean);
			const walEntries: MemoryWalEntry[] = [];
			const remaining: string[] = [];
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (
						parsed?.topic &&
						parsed.message &&
						parsed.deliveryAttempt === undefined
					) {
						walEntries.push(parsed as MemoryWalEntry);
					} else {
						remaining.push(line);
					}
				} catch {
					remaining.push(line);
				}
			}
			if (walEntries.length > 0) {
				this._memoryWalBuffer.push(...walEntries);
			}
			if (remaining.length > 0) {
				await fs.writeFile(
					ENV.DLQ_LOCAL_FALLBACK_PATH,
					`${remaining.join("\n")}\n`,
					"utf-8"
				);
			} else {
				await fs.writeFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "", "utf-8");
			}
			if (walEntries.length > 0) {
				logger.info(
					`Recovered ${walEntries.length} WAL entries from fallback file`
				);
			}
			return walEntries.length;
		} catch {
			return 0;
		}
	}

	async drainWalOnStartup(): Promise<void> {
		try {
			await this._recoverWalFromFallbackFile();
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

	async store(topic: string, message: Message): Promise<string> {
		const redis = await getStreamClient();
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

		const storeStart = Date.now();
		let attempt = 0;
		let lastError: Error | null = null;

		while (attempt < MAX_WAL_RETRY) {
			if (Date.now() - storeStart > STORE_OPERATION_TIMEOUT_MS) {
				logger.error("Stream store timed out — falling through to WAL", {
					topic,
					attempt,
					elapsed: Date.now() - storeStart,
				});
				break;
			}
			try {
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

		try {
			const walEntry = JSON.stringify({ topic, serialized });
			await redis.rpush(this._walKey(), walEntry);
			await redis.ltrim(this._walKey(), -WAL_LIST_MAX_LEN, -1);
			await redis.expire(this._walKey(), 7200);
		} catch (err) {
			logger.warn("Redis WAL list write failed, writing to in-memory buffer", {
				topic,
				error: (err as Error).message,
			});

			const warnThreshold = Math.floor(
				ENV.MEMORY_WAL_BUFFER_SIZE * ENV.MEMORY_WAL_BUFFER_WARN_PCT
			);
			if (this._memoryWalBuffer.length >= warnThreshold) {
				logger.warn("In-memory WAL buffer approaching capacity", {
					bufferSize: this._memoryWalBuffer.length,
					maxSize: ENV.MEMORY_WAL_BUFFER_SIZE,
					threshold: ENV.MEMORY_WAL_BUFFER_WARN_PCT,
				});
			}
			if (this._memoryWalBuffer.length >= ENV.MEMORY_WAL_BUFFER_SIZE) {
				const excess =
					this._memoryWalBuffer.length - ENV.MEMORY_WAL_BUFFER_SIZE + 1;
				const removed = this._memoryWalBuffer.splice(0, excess);
				BUFFER_DROPPED_TOTAL.inc(
					{ buffer: "memory-wal", reason: "buffer-full" },
					excess
				);

				let saved: boolean;
				try {
					const redis = await getStreamClient();
					const multi = redis.multi();
					for (const entry of removed) {
						multi.rpush(
							this._walKey(),
							JSON.stringify({
								topic: entry.topic,
								serialized: entry.serialized,
							})
						);
					}
					await multi.exec();
					saved = true;
				} catch {
					saved = false;
				}

				if (!saved) {
					const lines = removed
						.map((entry) => JSON.stringify(entry))
						.join("\n");
					const fileWritten = await retryFileAppend(
						ENV.DLQ_LOCAL_FALLBACK_PATH,
						lines
					);
					if (!fileWritten) {
						logger.error(
							"Memory WAL buffer eviction: all persistence layers exhausted — messages lost",
							{
								evictedCount: removed.length,
								buffer: "memory-wal",
							}
						);
					}
				}
			}

			this._memoryWalBuffer.push({ topic, serialized, message });
			return "memory-buffered";
		}

		this._flushWal().catch(() => {});
		return "wal-buffered";
	}

	private _walFlushWaiters: Array<() => void> = [];

	private async _flushWal(): Promise<void> {
		if (this._walFlushing) {
			return new Promise<void>((resolve) => {
				this._walFlushWaiters.push(resolve);
			});
		}
		this._walFlushing = true;

		const AtomicWalReadLua = `
      local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
      if #entries > 0 then
        redis.call('LTRIM', KEYS[1], #entries, -1)
      end
      return entries
    `;

		try {
			const redis = await getStreamClient();
			let consecutiveErrors = 0;
			while (true) {
				const raw = (await redis.eval(
					AtomicWalReadLua,
					1,
					this._walKey(),
					WAL_BATCH_SIZE.toString()
				)) as string[];
				if (raw.length === 0) {
					break;
				}

				const multi = redis.multi();
				for (const entry of raw) {
					try {
						const parsed = JSON.parse(entry) as {
							topic: string;
							serialized?: string;
							message?: Message;
						};
						const key = this._streamKey(parsed.topic);
						const data = parsed.serialized ?? safeStringify(parsed.message!);
						multi.xadd(
							key,
							"MAXLEN",
							"~",
							ENV.REDIS_STREAM_MAXLEN,
							"*",
							"data",
							data
						);
						multi.expire(key, ENV.REDIS_MESSAGE_TTL_S);
					} catch {
						logger.warn("WAL flush: malformed entry dropped", {
							entry: entry.substring(0, 200),
						});
					}
				}

				try {
					const results = await multi.exec();
					if (results) {
						const anyFailed = results.some(
							(resultItem) => resultItem[0] !== null
						);
						if (anyFailed) {
							consecutiveErrors++;
							logger.warn(
								"WAL flush pipeline: some commands failed — retrying batch",
								{
									consecutiveErrors,
									batchSize: raw.length,
								}
							);
							if (consecutiveErrors >= 5) {
								logger.error(
									"WAL flush: too many consecutive errors — switching to memory buffer"
								);
								for (const entry of raw) {
									try {
										const parsed = JSON.parse(entry) as {
											topic: string;
											serialized?: string;
											message?: Message;
										};
										if (parsed.message) {
											this._memoryWalBuffer.push({
												topic: parsed.topic,
												serialized:
													parsed.serialized ?? safeStringify(parsed.message),
												message: parsed.message,
											});
										} else if (parsed.serialized) {
											this._memoryWalBuffer.push({
												topic: parsed.topic,
												serialized: parsed.serialized,
												message: JSON.parse(parsed.serialized),
											});
										}
									} catch {}
								}
							} else if (raw.length > 0) {
								try {
									const restore = redis.multi();
									for (const entry of raw) {
										restore.rpush(this._walKey(), entry);
									}
									await restore.exec();
								} catch {
									for (const entry of raw) {
										try {
											const parsed = JSON.parse(entry) as {
												topic: string;
												serialized?: string;
												message?: Message;
											};
											this._memoryWalBuffer.push({
												topic: parsed.topic,
												serialized:
													parsed.serialized ?? safeStringify(parsed.message!),
												message:
													parsed.message ?? JSON.parse(parsed.serialized!),
											});
										} catch {}
									}
								}
							}
							const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30000);
							await this._sleepWithJitter(backoff);
							break;
						}
					}
					consecutiveErrors = 0;
				} catch (err) {
					consecutiveErrors++;
					const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30000);
					logger.error("WAL flush exec failed — retrying", {
						error: (err as Error).message,
						consecutiveErrors,
						backoff,
					});
					if (consecutiveErrors >= 5) {
						logger.error(
							"WAL flush: too many consecutive errors — switching to memory buffer"
						);
						for (const entry of raw) {
							try {
								const parsed = JSON.parse(entry) as {
									topic: string;
									serialized?: string;
									message?: Message;
								};
								this._memoryWalBuffer.push({
									topic: parsed.topic,
									serialized:
										parsed.serialized ?? safeStringify(parsed.message!),
									message: parsed.message ?? JSON.parse(parsed.serialized!),
								});
							} catch {}
						}
					} else if (raw.length > 0) {
						try {
							const restore = redis.multi();
							for (const entry of raw) {
								restore.rpush(this._walKey(), entry);
							}
							await restore.exec();
						} catch {
							for (const entry of raw) {
								try {
									const parsed = JSON.parse(entry) as {
										topic: string;
										serialized?: string;
										message?: Message;
									};
									this._memoryWalBuffer.push({
										topic: parsed.topic,
										serialized:
											parsed.serialized ?? safeStringify(parsed.message!),
										message: parsed.message ?? JSON.parse(parsed.serialized!),
									});
								} catch {}
							}
						}
					}
					await this._sleepWithJitter(backoff);
					break;
				}
			}
		} catch (err) {
			logger.error("WAL flush error", { error: (err as Error).message });
		} finally {
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
	}

	async drainWal(timeoutMs = 10_000): Promise<void> {
		if (this._walDrainRequested) {
			return;
		}
		this._walDrainRequested = true;
		const gen = ++this._walDrainGen;

		try {
			await this._flushMemoryWal();
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
		const redis = await getStreamClient();
		await redis.hset(
			this._pendingKey(instanceId),
			messageId,
			JSON.stringify({ ...data, pendingAt: Date.now() })
		);
		await redis.expire(this._pendingKey(instanceId), ENV.REDIS_MESSAGE_TTL_S);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		const redis = await getStreamClient();
		await redis.hdel(this._pendingKey(instanceId), messageId);
	}

	async getPendingAcks(
		instanceId: string
	): Promise<
		Record<string, { topic: string; subscriberUrl: string; message: Message }>
	> {
		const redis = await getStreamClient();
		const result: Record<
			string,
			{ topic: string; subscriberUrl: string; message: Message }
		> = {};
		let cursor = "0";
		do {
			const [nextCursor, batch] = await redis.hscan(
				this._pendingKey(instanceId),
				cursor,
				"COUNT",
				200
			);
			cursor = nextCursor;
			for (let i = 0; i < batch.length; i += 2) {
				try {
					result[batch[i]] = JSON.parse(batch[i + 1]);
				} catch {}
			}
		} while (cursor !== "0");
		return result;
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
		// Fast path: local LRU cache
		if (this._localDedupCache.has(deduplicationId)) {
			return false;
		}

		try {
			const redis = await getStreamClient();
			const key = `${this._prefix}dedup:${deduplicationId}`;
			const result = await redis.set(
				key,
				Date.now().toString(),
				"EX",
				ttlS,
				"NX"
			);
			if (result !== null) {
				this._localDedupCache.set(deduplicationId, true);
				return true;
			}
			return false;
		} catch (err) {
			// Degraded mode: use extended local cache as fallback dedup
			if (this._degradedDedupCache.has(deduplicationId)) {
				return false;
			}
			this._degradedDedupCache.set(deduplicationId, true);
			logger.warn("Dedup Redis unavailable — using degraded local cache", {
				deduplicationId,
				error: (err as Error).message,
			});
			return true;
		}
	}
}

export const messageStore = new MessageStore();
