import type addressManagerClient from "@trading-model/address-manager";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import {
	serviceUnreachableError,
	isServiceUnreachableError,
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { MessageManagerConfig } from "../shared/types/config";
import { TopicSubscriptionService } from "./topic-subscription-service";

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient {
	private _subscriptionService: TopicSubscriptionService;

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient,
	) {
		this._subscriptionService = new TopicSubscriptionService(
			_httpClient,
			_config,
			_addressManagerClient,
		);
	}

	async subscribeToTopics(topics: EventEnumMap[]): Promise<void> {
		return this._subscriptionService.subscribeToTopics(topics);
	}

	async unSubscribeToTopic(topics: EventEnumMap[]): Promise<void> {
		return this._subscriptionService.unSubscribeToTopic(topics);
	}

	async publishAsyncMessage<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(
				ServiceInstanceName.MessageDeliveryService
			);
			if (!target) {
				throw serviceUnreachableError(
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
			if (isServiceUnreachableError(error)) {
				throw error;
			}

			throw messageManagerError(
				"Failed to publish message to Message Manager",
				{ cause: normalizeError(error) }
			);
		}
	}

	async publishDirectMessage<TPayload = unknown>(
		service: ServiceInstanceName,
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(service);
			if (!target) {
				throw serviceUnreachableError(
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
			if (isServiceUnreachableError(error)) {
				throw error;
			}

			throw messageManagerError(
				`Failed to publish message to ${service}`,
				{ cause: normalizeError(error) }
			);
		}
	}
}
