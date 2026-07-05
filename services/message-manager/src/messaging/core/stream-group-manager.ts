import type { Message } from "@trading-model/common/contracts/message.types";

import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";

export class StreamGroupManager {
	constructor(private readonly _prefix: string) {}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
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
}
