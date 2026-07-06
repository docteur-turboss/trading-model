import type addressManagerClient from "@trading-model/address-manager";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import {
	ServiceUnreachableError,
	MessageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";

import type { MessageManagerConfig } from "../shared/types/config";
import { TopicSubscriptionHandler } from "./topic-subscription-handler";

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient {
	private readonly _subscriptionHandler: TopicSubscriptionHandler;

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient,
	) {
		this._subscriptionHandler = new TopicSubscriptionHandler(
			this._httpClient,
			this._config,
			this._addressManagerClient,
		);
	}

	async subscribeToTopics(topics: EventEnumMap[]): Promise<void> {
		return this._subscriptionHandler.subscribeToTopics(topics);
	}

	async unSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
		return this._subscriptionHandler.unSubscribeToTopic(topics);
	}

	/**
	 * Publishes a message to the broker for asynchronous delivery.
	 *
	 * @param payload - The message payload
	 * @param metadata - Routing and delivery metadata
	 */
	async publishAsyncMessage<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(
				ServiceInstanceName.MessageDeliveryService
			);
			if (!target) {
				throw new ServiceUnreachableError(
					"Unable to contact the message manager"
				);
			}

			const Messagepayload = {
				payload,
				metadata,
			};

			return await this._httpClient.post(
				`https://${target.ip}:${target.port}/message`,
				Messagepayload
			);
		} catch (error) {
			if (error instanceof ServiceUnreachableError) {
				throw error;
			}

			throw new MessageManagerError(
				"Failed to publish message to Message Manager",
				{ cause: normalizeError(error) }
			);
		}
	}

	/**
	 * Sends a message directly to a specific service.
	 *
	 * @param service - The target service to receive the message
	 * @param payload - The message payload
	 * @param metadata - Routing and delivery metadata
	 */
	async publishDirectMessage<TPayload = unknown>(
		service: ServiceInstanceName,
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(service);
			if (!target) {
				throw new ServiceUnreachableError(
					`Unable to contact the service: ${service}`
				);
			}

			const Messagepayload = {
				payload,
				metadata,
			};

			return await this._httpClient.post(
				`https://${target.ip}:${target.port}/message`,
				Messagepayload
			);
		} catch (error) {
			if (error instanceof ServiceUnreachableError) {
				throw error;
			}

			throw new MessageManagerError(
				`Failed to publish message to ${service}`,
				{ cause: normalizeError(error) }
			);
		}
	}
}
