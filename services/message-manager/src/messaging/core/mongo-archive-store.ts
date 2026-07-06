import { ENV } from "../../config/env";
import { ArchiveTimerScheduler } from "./archive-timer-scheduler";
import { ArchiveTopicsCache } from "./archive-topics-cache";
import { messageStore } from "./message-store";
import { MongoClientManager } from "./mongo-client-manager";

export class MongoArchiveStore {
	private readonly _clientManager = new MongoClientManager();
	private readonly _timerScheduler = new ArchiveTimerScheduler();
	private readonly _topicsCache = new ArchiveTopicsCache();

	async start(): Promise<void> {
		if (!this._clientManager.canStart()) {
			return;
		}
		this._clientManager.markStarted();

		try {
			await this._clientManager.connectClient();
			await this._clientManager.ensureIndexes();
			this._timerScheduler.start(ENV.MONGO_ARCHIVE_INTERVAL_MS, () =>
				this._archiveBatch()
			);
			this._topicsCache.startRefresh();
		} catch (err) {
			this._clientManager.handleStartError(err as Error);
		}
	}

	private async _archiveBatch(): Promise<void> {
		if (!this._clientManager.client) {
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

			const { MongoArchiveBatchWriter } = await import(
				"./mongo-archive-batch.js"
			);
			const writer = new MongoArchiveBatchWriter(
				this._clientManager.requiredClient,
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
		await this._clientManager.closeClient();
	}
}

export const mongoArchiveStore = new MongoArchiveStore();
