import {
	toTopic,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { ENV } from "../../config/env";
import { ArchiveTimerScheduler } from "./archive-timer-scheduler";
import { ArchiveTopicsCache } from "./archive-topics-cache";
import {
	type IStreamGroupOps,
	MessageRoutingFacade,
} from "./message-routing-facade";
import { MongoClientManager } from "./mongo-client-manager";

export class MongoArchiveStore {
	private readonly _routing: IStreamGroupOps;
	private readonly _clientManager = new MongoClientManager();
	private readonly _timerScheduler = new ArchiveTimerScheduler();
	private readonly _topicsCache = new ArchiveTopicsCache();

	constructor(prefix?: string) {
		this._routing = new MessageRoutingFacade(prefix ?? ENV.REDIS_PREFIX);
	}

	async start(): Promise<void> {
		if (!this._clientManager.canStart()) {
			return;
		}

		try {
			await this._initArchiveClient();
		} catch (err) {
			this._clientManager.handleStartError(err as Error);
		}
	}

	private async _initArchiveClient(): Promise<void> {
		await this._clientManager.connectClient();
		await this._clientManager.ensureIndexes();
		this._timerScheduler.start(ENV.MONGO_ARCHIVE_INTERVAL_MS, () =>
			this._archiveBatch()
		);
		this._topicsCache.startRefresh();
	}

	private async _archiveBatch(): Promise<void> {
		const client = this._clientManager.client;
		if (!client) {
			return;
		}

		const topics = this._topicsCache.getTopics();
		if (topics.length === 0) {
			return;
		}

		for (const topic of topics) {
			await this._archiveTopic(topic, client);
		}
	}

	private async _archiveTopic(
		topic: string,
		client: NonNullable<typeof this._clientManager.client>
	): Promise<void> {
		try {
			const messages = await this._fetchTopicMessages(topic);
			if (messages.length === 0) {
				return;
			}
			await this._writeArchiveBatch(client, messages);
		} catch {}
	}

	private _fetchTopicMessages(topic: string) {
		return this._routing.getMessagesAfter({
			topic: toTopic(topic),
			afterTimestamp: UnixTimestamp.of(Date.now() - 3600_000),
			limit: ENV.MONGO_ARCHIVE_BATCH_SIZE,
		});
	}

	private async _writeArchiveBatch(
		client: NonNullable<typeof this._clientManager.client>,
		messages: import("@trading-model/common/contracts/message.types").Message[]
	): Promise<void> {
		const { MongoArchiveBatchWriter } = await import(
			"./mongo-archive-batch.js"
		);
		const writer = new MongoArchiveBatchWriter({
			client,
			dbName: ENV.MONGO_ARCHIVE_DB,
			collectionName: ENV.MONGO_ARCHIVE_COLLECTION,
		});
		await writer.writeArchiveBatch(messages);
	}

	async stop(): Promise<void> {
		this._timerScheduler.stop();
		this._topicsCache.stopRefresh();
		await this._clientManager.closeClient();
	}
}

export const mongoArchiveStore = new MongoArchiveStore();
