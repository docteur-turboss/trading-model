import type addressManagerClient from "@trading-model/address-manager";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { URLString } from "@trading-model/common/domain/primitives";
import type { HostPort } from "@trading-model/common/domain/service-identity";
import { toHostPortAddress } from "@trading-model/common/domain/service-identity";
import {
	isServiceUnreachableError,
	messageManagerError,
	normalizeError,
	serviceUnreachableError,
} from "@trading-model/common/utils/errors";
import type { MessageMetadata } from "@trading-model/validation/contracts/message.types";
import type { MessageManagerConfig } from "../shared/types/config";
import type { IPublishClient } from "./i-publish-client";
import { TopicSubscriptionService } from "./topic-subscription-service";

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient implements IPublishClient {
	private _subscriptionService: TopicSubscriptionService;

	constructor(
		private readonly _httpClient: HttpClient,
		readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient
	) {
		this._subscriptionService = new TopicSubscriptionService(
			_httpClient,
			_config,
			_addressManagerClient
		);
	}

	subscribeToTopics(topics: EventEnumMap[]): Promise<void> {
		return this._subscriptionService.subscribeToTopics(topics);
	}

	unSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
		return this._subscriptionService.unSubscribeToTopic(topics);
	}

	private async _findService(service: ServiceInstanceName): Promise<HostPort> {
		const target = await this._addressManagerClient.findService(service);
		if (!target) {
			throw serviceUnreachableError(
				`Unable to contact the service: ${service}`
			);
		}
		return target;
	}

	private async _publishToService<TPayload = unknown>(
		target: HostPort,
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		return await this._httpClient.post(
			URLString.of(`https://${toHostPortAddress(target)}/message`),
			{ payload, metadata }
		);
	}

	private _wrapPublishError(error: unknown, service: string): never {
		if (isServiceUnreachableError(error)) {
			throw error;
		}
		throw messageManagerError(`Failed to publish message to ${service}`, {
			cause: normalizeError(error),
		});
	}

	publish<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		return this.publishAsyncMessage(payload, metadata);
	}

	async publishAsyncMessage<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._findService(
				ServiceInstanceName.MessageDeliveryService
			);
			return await this._publishToService(target, payload, metadata);
		} catch (error) {
			this._wrapPublishError(error, "Message Manager");
		}
	}

	async publishDirectMessage<TPayload = unknown>(
		service: ServiceInstanceName,
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._findService(service);
			return await this._publishToService(target, payload, metadata);
		} catch (error) {
			this._wrapPublishError(error, service);
		}
	}
}
