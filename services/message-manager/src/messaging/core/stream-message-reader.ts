import type { Message } from "@trading-model/common/contracts/message.types";

import { getStreamClient } from "../../config/redis";
import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";

export class StreamMessageReader {
	constructor(private readonly _prefix: string) {}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	async readFromGroup(
		params: ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		const { topic, groupName, consumerId, count = 10, blockMs = 1000 } = params;
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
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		const { topic, timeRange, limit = 100 } = params;
		const redis = await getStreamClient();
		const minId = `${timeRange.fromMs}-0`;
		const maxId = `${timeRange.toMs}-0`;
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
}
