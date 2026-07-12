import type { Topic } from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/contracts/message.types";
import { getStreamClient } from "../../config/redis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { MessageQuery } from "./messaging-types";
import type {
	GetMessagesBetweenParams,
	ReadFromGroupParams,
} from "./stream-group-manager";

export class StreamMessageReader {
	constructor(private readonly _keys: RedisKeyBuilder) {}

	private _streamKey(topic: Topic): string {
		return this._keys.key("stream", topic);
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
		return this._parseStreamGroupResult(
			rawResult as [string, [string, string[]][]][]
		);
	}

	private _parseStreamGroupResult(
		result: [string, [string, string[]][]][]
	): Array<{ id: string; data: string }> {
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

	async getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		const redis = await getStreamClient();
		const minId = `${query.afterTimestamp}-0`;
		const results = await redis.xrange(
			this._streamKey(query.topic),
			minId,
			"+",
			"COUNT",
			query.limit ?? 100
		);
		return this._parseMessageResults(results);
	}

	async getMessagesBetween(
		params: GetMessagesBetweenParams
	): Promise<Message[]> {
		const { topic, timeRange, limit = 100 } = params;
		const redis = await getStreamClient();
		const minId = `${timeRange.start?.getTime() ?? 0}-0`;
		const maxId = `${timeRange.end?.getTime() ?? Date.now()}-0`;
		const results = await redis.xrange(
			this._streamKey(topic),
			minId,
			maxId,
			"COUNT",
			limit
		);
		return this._parseMessageResults(results);
	}

	private _parseMessageResults(results: [string, string[]][]): Message[] {
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
