import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { messageStore } from "./message-store";
import { MongoArchiveBatchWriter } from "./mongo-archive-batch";
import type { MongoClient } from "./mongo-archive-batch";

export class MongoArchiveStore {
	private _client: MongoClient | null = null;
	private _batchWriter: MongoArchiveBatchWriter | null = null;
	private _archiveTimer: ReturnType<typeof setInterval> | null = null;
	private _started = false;
	private _topicsCache: string[] = [];
	private _topicsCacheTimer: ReturnType<typeof setInterval> | null = null;

	async start(): Promise<void> {
		if (!this._canStart()) {
			return;
		}
		this._started = true;

		try {
			await this._connectClient();
			await this._ensureIndexes();
			this._startArchiveTimer();
			this._startTopicsCacheRefresh();
		} catch (err) {
			this._handleStartError(err as Error);
		}
	}

	private _canStart(): boolean {
		if (!ENV.MONGO_ARCHIVE_URI) {
			logger.info("MongoDB archival not configured — skipping");
			return false;
		}
		if (this._started) {
			return false;
		}
		return true;
	}

	private _handleStartError(err: Error): void {
		logger.warn(
			"MongoDB archival store failed to start — continuing without archival",
			{ error: err.message }
		);
		this._client = null;
	}

	private async _connectClient(): Promise<void> {
		const { MongoClient: MongoDriver } = await import("mongodb");
		this._client = new MongoDriver(
			ENV.MONGO_ARCHIVE_URI!
		) as unknown as MongoClient;
		await (
			this._client as unknown as { connect: () => Promise<void> }
		).connect();
		this._batchWriter = new MongoArchiveBatchWriter(
			this._client,
			ENV.MONGO_ARCHIVE_DB,
			ENV.MONGO_ARCHIVE_COLLECTION
		);
		logger.info("MongoDB archival store connected");
	}

	private async _ensureIndexes(): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			await this._batchWriter!.createIndexes();
			logger.info("MongoDB archive indexes ensured");
		} catch (err) {
			logger.warn("Failed to create archive indexes", { context: {
				error: (err as Error).message,
			} });
		}
	}

	private _startTopicsCacheRefresh(): void {
		this._topicsCacheTimer = setInterval(async () => {
			try {
				const { getSubscriptionClient } = await import("../../config/redis.js");
				const redis = await getSubscriptionClient();
				const topics = await redis.smembers(`${ENV.REDIS_PREFIX}topics`);
				this._topicsCache = topics;
			} catch {
				// best-effort
			}
		}, 30_000);
		this._topicsCacheTimer.unref();
	}

	private _startArchiveTimer(): void {
		this._archiveTimer = setInterval(() => {
			this._archiveBatch().catch((err) => {
				logger.warn("MongoDB archive batch failed", { context: {
					error: (err as Error).message,
				} });
			});
		}, ENV.MONGO_ARCHIVE_INTERVAL_MS);
		this._archiveTimer.unref();
	}

	private async _archiveBatch(): Promise<void> {
		if (!this._client) {
			return;
		}

		const topics = this._topicsCache;
		if (topics.length === 0) {
			return;
		}

		for (const topic of topics) {
			await this._archiveTopic(topic);
		}
	}

	private async _archiveTopic(topic: string): Promise<void> {
		try {
			const messages = await messageStore.getMessagesAfter(
				topic,
				Date.now() - 3600_000,
				ENV.MONGO_ARCHIVE_BATCH_SIZE
			);
			if (messages.length === 0) {
				return;
			}

			await this._batchWriter!.writeArchiveBatch(messages);
		} catch {
			// continue to next topic
		}
	}

	async stop(): Promise<void> {
		this._clearArchiveTimer();
		this._clearTopicsCacheTimer();
		await this._closeClient();
		this._started = false;
	}

	private _clearArchiveTimer(): void {
		if (this._archiveTimer) {
			clearInterval(this._archiveTimer);
			this._archiveTimer = null;
		}
	}

	private _clearTopicsCacheTimer(): void {
		if (this._topicsCacheTimer) {
			clearInterval(this._topicsCacheTimer);
			this._topicsCacheTimer = null;
		}
	}

	private async _closeClient(): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			await this._client.close();
		} catch {
			// best-effort
		}
		this._client = null;
	}
}

export const mongoArchiveStore = new MongoArchiveStore();
