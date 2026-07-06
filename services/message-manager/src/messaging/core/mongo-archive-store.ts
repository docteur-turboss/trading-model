import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { messageStore } from "./message-store";

const SET_ON_INSERT = "$setOnInsert";

interface ArchiveEntry {
	messageId: string;
	topic: string;
	eventType: string;
	producer: string;
	payload: unknown;
	metadata: Record<string, unknown>;
	archivedAt: Date;
	ttl: Date;
}

interface MongoClient {
	db: (name: string) => {
		collection: (name: string) => {
			insertMany: (docs: unknown[]) => Promise<unknown>;
			createIndex: (
				keys: Record<string, number>,
				opts?: Record<string, unknown>
			) => Promise<string>;
			countDocuments: (filter: Record<string, unknown>) => Promise<number>;
			deleteMany: (
				filter: Record<string, unknown>
			) => Promise<{ deletedCount: number }>;
			bulkWrite: (ops: unknown[]) => Promise<unknown>;
		};
	};
	close: () => Promise<void>;
}

export class MongoArchiveStore {
	private _client: MongoClient | null = null;
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
		const { MongoClient } = await import("mongodb");
		this._client = new MongoClient(
			ENV.MONGO_ARCHIVE_URI!
		) as unknown as MongoClient;
		await (
			this._client as unknown as { connect: () => Promise<void> }
		).connect();
		logger.info("MongoDB archival store connected");
	}

	private async _ensureIndexes(): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			const col = this._getCollection();
			await this._createIndexes(col);
			logger.info("MongoDB archive indexes ensured");
		} catch (err) {
			logger.warn("Failed to create archive indexes", { context: {
				error: (err as Error).message,
			} });
		}
	}

	private _getCollection(): ReturnType<ReturnType<MongoClient["db"]>["collection"]> {
		return this._client!
			.db(ENV.MONGO_ARCHIVE_DB)
			.collection(ENV.MONGO_ARCHIVE_COLLECTION) as ReturnType<
				ReturnType<MongoClient["db"]>["collection"]
			>;
	}

	private async _createIndexes(
		col: ReturnType<ReturnType<MongoClient["db"]>["collection"]>
	): Promise<void> {
		await col.createIndex(
			{ messageId: 1 },
			{ unique: true, background: true }
		);
		await col.createIndex({ topic: 1, archivedAt: -1 }, { background: true });
		await col.createIndex(
			{ ttl: 1 },
			{ expireAfterSeconds: 0, background: true }
		);
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

			const entries = messages.map(_messageToArchiveEntry);
			const bulkOps = _buildBulkUpserts(entries);

			if (bulkOps.length > 0) {
				const col = this._client!
					.db(ENV.MONGO_ARCHIVE_DB)
					.collection(ENV.MONGO_ARCHIVE_COLLECTION);
				await col.bulkWrite(bulkOps);
			}
		} catch {
			// continue to next topic
		}
	}

	async stop(): Promise<void> {
		if (this._archiveTimer) {
			clearInterval(this._archiveTimer);
			this._archiveTimer = null;
		}
		if (this._topicsCacheTimer) {
			clearInterval(this._topicsCacheTimer);
			this._topicsCacheTimer = null;
		}
		if (this._client) {
			try {
				await this._client.close();
			} catch {
				// best-effort
			}
			this._client = null;
		}
		this._started = false;
	}
}

export const mongoArchiveStore = new MongoArchiveStore();

function _messageToArchiveEntry(msg: Message): ArchiveEntry {
	return {
		messageId: msg.metadata.messageId ?? "",
		topic: msg.metadata.topic,
		eventType: msg.metadata.eventType,
		producer: msg.metadata.publisher?.serviceName ?? "unknown",
		payload: msg.payload,
		metadata: msg.metadata as unknown as Record<string, unknown>,
		archivedAt: new Date(),
		ttl: new Date(Date.now() + ENV.MONGO_ARCHIVE_RETENTION_DAYS * 86400_000),
	};
}

function _buildBulkUpserts(entries: ArchiveEntry[]): Array<{
	updateOne: {
		filter: { messageId: string };
		update: { [SET_ON_INSERT]: ArchiveEntry };
		upsert: true;
	};
}> {
	return entries
		.filter((entry) => entry.messageId)
		.map((entry) => ({
			updateOne: {
				filter: { messageId: entry.messageId },
				update: { [SET_ON_INSERT]: entry },
				upsert: true,
			},
		}));
}
