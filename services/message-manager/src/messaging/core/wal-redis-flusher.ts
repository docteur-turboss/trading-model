import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { WAL_BATCH_SIZE } from "../../config/wal-config";
const WAL_LIST_MAX_LEN = 1_000_000;
const ATOMIC_WAL_READ_LUA = `
  local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
  if #entries > 0 then
    redis.call('LTRIM', KEYS[1], #entries, -1)
  end
  return entries
`;

export class WalRedisFlusher {
	constructor(
		private readonly _prefix: string,
		private readonly _memoryWalBuffer: MemoryWalBuffer,
	) {}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	async store(topic: string, serialized: string): Promise<void> {
		const redis = await getStreamClient();
		const walEntry = JSON.stringify({ topic, serialized });
		await redis.rpush(this._walKey(), walEntry);
		await redis.ltrim(this._walKey(), -WAL_LIST_MAX_LEN, -1);
		await redis.expire(this._walKey(), 7200);
	}

	private _parseWalEntry(
		entry: string,
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
				context: { entry: entry.substring(0, 200) },
			});
			return null;
		}
	}

	private async _flushBatch(raw: string[]): Promise<boolean> {
		const redis = await getStreamClient();
		const multi = redis.multi();
		for (const entry of raw) {
			const parsed = this._parseWalEntry(entry);
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
				parsed.data,
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

	private _bufferEntries(raw: string[]): void {
		for (const entry of raw) {
			try {
				const parsed = JSON.parse(entry) as {
					topic: string;
					serialized?: string;
					message?: Message;
				};
				const topic = parsed.topic;
				const serialized =
					parsed.serialized ?? safeStringify(parsed.message!);
				const message = parsed.message ?? JSON.parse(parsed.serialized!);
				this._memoryWalBuffer.push(topic, serialized, message);
			} catch {
				/* best-effort */
			}
		}
	}

	private async _handleError(
		raw: string[],
		consecutiveErrors: number,
	): Promise<"retry" | "memory-buffer" | "abort"> {
		if (consecutiveErrors >= 5) {
			logger.error(
				"WAL flush: too many consecutive errors — switching to memory buffer",
			);
			this._bufferEntries(raw);
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
				this._bufferEntries(raw);
			}
		}

		return "retry";
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter))),
		);
	}

	async flushAll(): Promise<void> {
		const redis = await getStreamClient();
		let consecutiveErrors = 0;
		while (true) {
			const raw = (await redis.eval(
				ATOMIC_WAL_READ_LUA,
				1,
				this._walKey(),
				WAL_BATCH_SIZE.toString(),
			)) as string[];
			if (raw.length === 0) {
				break;
			}

			const ok = await this._flushBatch(raw);
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
				},
			);
			const action = await this._handleError(raw, consecutiveErrors);
			const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30000);
			await this._sleepWithJitter(backoff);
			if (action === "abort") {
				break;
			}
			break;
		}
	}
}
