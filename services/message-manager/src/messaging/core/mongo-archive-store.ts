import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { messageStore } from "./message-store";
import { ArchiveTimerScheduler } from "./archive-timer-scheduler";
import { ArchiveTopicsCache } from "./archive-topics-cache";
import type { MongoClient } from "./mongo-archive-batch";

export class MongoArchiveStore {
	private _client: MongoClient | null = null;
	private get _requiredClient(): MongoClient {
		if (!this._client) throw new Error("MongoArchiveStore not started");
		return this._client;
	}
	private _started = false;
	private readonly _timerScheduler = new ArchiveTimerScheduler();
	private readonly _topicsCache = new ArchiveTopicsCache();

	async start(): Promise<void> {
		if (!this._canStart()) {
			return;
		}
		this._started = true;

		try {
			await this._connectClient();
			await this._ensureIndexes();
			this._timerScheduler.start(ENV.MONGO_ARCHIVE_INTERVAL_MS, () =>
				this._archiveBatch()
			);
			this._topicsCache.startRefresh();
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
		logger.info("MongoDB archival store connected");
	}

	private async _ensureIndexes(): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			const { MongoArchiveBatchWriter } = await import("./mongo-archive-batch");
			const writer = new MongoArchiveBatchWriter(
				this._client,
				ENV.MONGO_ARCHIVE_DB,
				ENV.MONGO_ARCHIVE_COLLECTION
			);
			await writer.createIndexes();
			logger.info("MongoDB archive indexes ensured");
		} catch (err) {
			logger.warn("Failed to create archive indexes", { context: {
				error: (err as Error).message,
			} });
		}
	}

	private async _archiveBatch(): Promise<void> {
		if (!this._client) {
			return;
		}

		const topics = this._topicsCache.getTopics();
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

			const { MongoArchiveBatchWriter } = await import("./mongo-archive-batch");
			const writer = new MongoArchiveBatchWriter(
				this._requiredClient,
				ENV.MONGO_ARCHIVE_DB,
				ENV.MONGO_ARCHIVE_COLLECTION
			);
			await writer.writeArchiveBatch(messages);
		} catch {
			// continue to next topic
		}
	}

	async stop(): Promise<void> {
		this._timerScheduler.stop();
		this._topicsCache.stopRefresh();
		await this._closeClient();
		this._started = false;
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
