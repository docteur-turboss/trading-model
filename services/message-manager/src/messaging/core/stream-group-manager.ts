import type { Message } from "@trading-model/common/contracts/message.types";
import type { TimeRange } from "@trading-model/common/domain/time-range";

import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { StreamMessageReader } from "./stream-message-reader";

export interface ReadFromGroupParams {
	topic: string;
	groupName: string;
	consumerId: string;
	count?: number;
	blockMs?: number;
}

export interface GetMessagesBetweenParams {
	topic: string;
	timeRange: TimeRange;
	limit?: number;
}

export class StreamGroupManager {
	private readonly _reader: StreamMessageReader;

	constructor(private readonly _prefix: string) {
		this._reader = new StreamMessageReader(this._prefix);
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
		try {
			await this._createGroup(topic, groupName);
		} catch (err: unknown) {
			this._handleGroupError(topic, groupName, err);
		}
	}

	private async _createGroup(topic: string, groupName: string): Promise<void> {
		const redis = await getStreamClient();
		await redis.xgroup(
			"CREATE",
			this._streamKey(topic),
			groupName,
			"$",
			"MKSTREAM"
		);
	}

	private _handleGroupError(
		topic: string,
		groupName: string,
		err: unknown
	): void {
		if (err instanceof Error && !err.message.includes("BUSYGROUP")) {
			logger.warn("Failed to create consumer group", {
				context: {
					topic,
					groupName,
					error: err.message,
				},
			});
		}
	}

	async readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._reader.readFromGroup(params);
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
		return this._reader.getMessagesAfter(topic, afterTimestamp, limit);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._reader.getMessagesBetween(params);
	}

	async getStreamLag(topic: string, groupName: string): Promise<number> {
		try {
			const redis = await getStreamClient();
			const info = (await redis.call(
				"XINFO",
				"GROUPS",
				this._streamKey(topic)
			)) as unknown[];
			return computeLag(info as unknown[][], groupName);
		} catch {
			return 0;
		}
	}
}

function computeLag(groups: unknown[][], groupName: string): number {
	for (const group of groups) {
		if (String(group[1]) === groupName) {
			const lastDelivered = String(group[5] ?? "0-0");
			const lastTimestamp =
				Number.parseInt(lastDelivered.split("-")[0], 10) || 0;
			return Date.now() - lastTimestamp;
		}
	}
	return 0;
}
