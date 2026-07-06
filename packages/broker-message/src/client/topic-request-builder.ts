import { toTopic, toInstanceId } from "@trading-model/common/domain/primitives";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import {
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { MessageManagerConfig } from "../shared/types/config";
import type {
	SubscribesTopicsPayload,
	UnSubscribesTopicsPayload,
} from "../shared/types/payloads";

export class TopicRequestBuilder {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: MessageManagerConfig,
	) {}

	async subscribeToSingleTopic(
		topic: EventEnumMap,
		targetUrl: string,
	): Promise<void> {
		const payload: SubscribesTopicsPayload = {
			callbackPath: this._config.callbackPath,
			consumerIdentity: {
				instanceId: toInstanceId(this._config.instanceId),
				serviceName: this._config.serviceName,
			},
			topic: toTopic(topic),
		};

		try {
			return await this._httpClient.post(targetUrl, payload);
		} catch (error) {
			throw messageManagerError(
				"Failed to subscribe topic to Message Manager",
				{ cause: normalizeError(error) },
			);
		}
	}

	async unsubscribeToSingleTopic(
		topic: EventEnumMap,
		targetUrl: string,
	): Promise<void> {
		const payload: UnSubscribesTopicsPayload = {
			instanceId: this._config.instanceId,
			topic: toTopic(topic),
		};

		try {
			return await this._httpClient.delete(targetUrl, payload);
		} catch (error) {
			throw messageManagerError(
				"Failed to unsubscribe topic to Message Manager",
				{ cause: normalizeError(error) },
			);
		}
	}

	async subscribeAll(
		topics: EventEnumMap[],
		target: { ip: string; port: number },
	): Promise<void> {
		for (const topic of topics) {
			await this.subscribeToSingleTopic(
				topic,
				`https://${target.ip}:${target.port}/subscribe`,
			);
		}
	}

	async unsubscribeAll(
		topics: EventEnumMap[],
		target: { ip: string; port: number },
	): Promise<void> {
		for (const topic of topics) {
			await this.unsubscribeToSingleTopic(
				topic,
				`https://${target.ip}:${target.port}/subscribe`,
			);
		}
	}
}
