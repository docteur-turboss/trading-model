import type addressManagerClient from "@trading-model/address-manager";
import { toTopic } from "@trading-model/common/domain/primitives";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	serviceUnreachableError,
	isServiceUnreachableError,
	messageManagerError,
	isMessageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { MessageManagerConfig } from "../shared/types/config";
import type {
	SubscribesTopicsPayload,
	UnSubscribesTopicsPayload,
} from "../shared/types/payloads";

export class TopicSubscriptionService {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient,
	) {}

	async subscribeToTopics(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._findMessageService();
			await this._subscribeAll(topics, target);
		} catch (err) {
			this._handleSubscribeError(err, "subscribe");
		}
	}

	async unSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._findMessageService();
			await this._unsubscribeAll(topics, target);
		} catch (err) {
			this._handleSubscribeError(err, "unsubscribe");
		}
	}

	private async _findMessageService(): Promise<{ ip: string; port: number }> {
		const target = await this._addressManagerClient.findService(
			ServiceInstanceName.MessageDeliveryService,
		);
		if (!target) {
			throw serviceUnreachableError("Unable to contact the message manager");
		}
		return target;
	}

	private async _subscribesToASingleTopic(
		topic: EventEnumMap,
		targetUrl: string,
	): Promise<void> {
		const payload: SubscribesTopicsPayload = {
			callbackPath: this._config.callbackPath,
			consumerIdentity: {
				instanceId: this._config.instanceId,
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

	private async _unSubscribesToASingleTopic(
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

	private async _subscribeAll(
		topics: EventEnumMap[],
		target: { ip: string; port: number },
	): Promise<void> {
		for (const topic of topics) {
			await this._subscribesToASingleTopic(
				topic,
				`https://${target.ip}:${target.port}/subscribe`,
			);
		}
	}

	private async _unsubscribeAll(
		topics: EventEnumMap[],
		target: { ip: string; port: number },
	): Promise<void> {
		for (const topic of topics) {
			await this._unSubscribesToASingleTopic(
				topic,
				`https://${target.ip}:${target.port}/subscribe`,
			);
		}
	}

	private _handleSubscribeError(err: unknown, action: string): never {
		if (isServiceUnreachableError(err)) {
			throw err;
		}
		if (isMessageManagerError(err)) {
			return undefined as never;
		}
		throw messageManagerError(
			`Failed to ${action} topic to Message Manager`,
			{ cause: normalizeError(err) },
		);
	}
}
