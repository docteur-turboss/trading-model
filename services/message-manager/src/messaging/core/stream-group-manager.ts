import type { DateRange } from "@trading-model/common/domain/date-range";
import type {
	ConsumerGroupName,
	ConsumerId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";
import { computeLag } from "./stream-lag-calculator";
import { StreamMessageReader } from "./stream-message-reader";

export interface ReadFromGroupParams {
	topic: Topic;
	groupName: ConsumerGroupName;
	consumerId: ConsumerId;
	count?: number;
	blockMs?: number;
}

export interface GetMessagesBetweenParams {
	topic: Topic;
	timeRange: DateRange;
	limit?: number;
}

export class StreamGroupManager {
	private readonly _reader: StreamMessageReader;

	constructor(private readonly _keys: RedisKeyBuilder) {
		this._reader = new StreamMessageReader(this._keys);
	}

	private _streamKey(topic: Topic): string {
		return this._keys.key("stream", topic);
	}

	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		try {
			await this._createGroup(ref);
		} catch (err: unknown) {
			this._handleGroupError(ref, err);
		}
	}

	private async _createGroup(ref: StreamGroupRef): Promise<void> {
		const redis = await getStreamClient();
		await redis.xgroup(
			"CREATE",
			this._streamKey(ref.topic),
			ref.groupName,
			"$",
			"MKSTREAM"
		);
	}

	private _handleGroupError(ref: StreamGroupRef, err: unknown): void {
		if (err instanceof Error && !err.message.includes("BUSYGROUP")) {
			logger.warn("Failed to create consumer group", {
				context: {
					topic: ref.topic,
					groupName: ref.groupName,
					error: err.message,
				},
			});
		}
	}

	readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._reader.readFromGroup(params);
	}

	async ackMessage(ref: AckRef): Promise<void> {
		const redis = await getStreamClient();
		await redis.xack(this._streamKey(ref.topic), ref.groupName, ref.messageId);
	}

	async getPendingCount(ref: StreamGroupRef): Promise<number> {
		const redis = await getStreamClient();
		const rawResult = await redis.xpending(
			this._streamKey(ref.topic),
			ref.groupName
		);
		const result = rawResult as unknown as { pending: number };
		return (result?.pending as number) || 0;
	}

	getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		return this._reader.getMessagesAfter(query);
	}

	getMessagesBetween(params: GetMessagesBetweenParams): Promise<Message[]> {
		return this._reader.getMessagesBetween(params);
	}

	async getStreamLag(ref: StreamGroupRef): Promise<number> {
		try {
			const redis = await getStreamClient();
			const info = (await redis.call(
				"XINFO",
				"GROUPS",
				this._streamKey(ref.topic)
			)) as unknown[];
			return computeLag(info as unknown[][], ref.groupName);
		} catch {
			return 0;
		}
	}
}
