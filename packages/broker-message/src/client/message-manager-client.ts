import type addressManagerClient from "@trading-model/address-manager";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import {
	AppError,
	ServiceUnreachableError,
	MessageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";

import type { MessageManagerConfig } from "../shared/types/config";
import type {
	SubscribesTopicsPayload,
	UnSubscribesTopicsPayload,
} from "../shared/types/payloads";

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient {
	/**
	 */
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient
	) {}

	/** Subscribes to a single topic via the Message Delivery Service. */
	private async _subscribesToASingleTopic(
		topic: EventEnumMap,
		targetUrl: string
	): Promise<void> {
		const payload: SubscribesTopicsPayload = {
			callbackPath: this._config.callbackPath,
			consumerIdentity: {
				instanceId: this._config.instanceId,
				serviceName: this._config.serviceName,
			},
			topic,
		};

		try {
			return await this._httpClient.post(targetUrl, payload);
		} catch (error) {
			throw new MessageManagerError(
				"Failed to subscribe topic to Message Manager",
				{ cause: normalizeError(error) }
			);
		}
	}

	/** Unsubscribes from a single topic via the Message Delivery Service. */
	private async _unSubscribesToASingleTopic(
		topic: EventEnumMap,
		targetUrl: string
	): Promise<void> {
		const payload: UnSubscribesTopicsPayload = {
			instanceId: this._config.instanceId,
			topic,
		};

		try {
			return await this._httpClient.delete(targetUrl, payload);
		} catch (error) {
			throw new MessageManagerError(
				"Failed to unsubscribe topic to Message Manager",
				{ cause: normalizeError(error) }
			);
		}
	}

	/**
	 * Subscribes to the given event topics.
	 *
	 * @param topics - The topics to subscribe to
	 */
	async subscribeToTopics(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(
				ServiceInstanceName.MessageDeliveryService
			);
			if (!target) {
				throw new ServiceUnreachableError(
					"Unable to contact the message manager"
				);
			}

			for (const topic of topics) {
				await this._subscribesToASingleTopic(
					topic,
					`https://${target.ip}:${target.port}/subscribe`
				);
			}
		} catch (err) {
			if (err instanceof ServiceUnreachableError) {
				throw err;
			}
			if (err instanceof MessageManagerError) {
				return;
			}

			throw new MessageManagerError(
				"Failed to subscribe topic to Message Manager",
				{ cause: normalizeError(err) }
			);
		}
	}

	/**
	 * Unsubscribes from the given event topics.
	 *
	 * @param topics - The topics to unsubscribe from
	 */
	async unSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(
				ServiceInstanceName.MessageDeliveryService
			);
			if (!target) {
				throw new ServiceUnreachableError(
					"Unable to contact the message manager"
				);
			}

			for (const topic of topics) {
				await this._unSubscribesToASingleTopic(
					topic,
					`https://${target.ip}:${target.port}/subscribe`
				);
			}
		} catch (err) {
			if (err instanceof ServiceUnreachableError) {
				throw err;
			}
			if (err instanceof MessageManagerError) {
				return;
			}

			throw new MessageManagerError(
				"Failed to unsubscribe topic to Message Manager",
				{ cause: normalizeError(err) }
			);
		}
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
