import type addressManagerClient from "@trading-model/address-manager";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	serviceUnreachableError,
	isServiceUnreachableError,
	isMessageManagerError,
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { MessageManagerConfig } from "../shared/types/config";
import { TopicRequestBuilder } from "./topic-request-builder";

export class TopicSubscriptionService {
	private readonly _requestBuilder: TopicRequestBuilder;

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient,
	) {
		this._requestBuilder = new TopicRequestBuilder(_httpClient, _config);
	}

	async subscribeToTopics(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._findMessageService();
			await this._requestBuilder.subscribeAll(topics, target);
		} catch (err) {
			this._handleSubscribeError(err, "subscribe");
		}
	}

	async unSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._findMessageService();
			await this._requestBuilder.unsubscribeAll(topics, target);
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
