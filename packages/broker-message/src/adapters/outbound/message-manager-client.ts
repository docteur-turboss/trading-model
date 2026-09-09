import type addressManagerClient from "@trading-model/address-manager";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { URLString } from "@trading-model/common/domain/primitives";
import { HostPort } from "@trading-model/common/domain/service-identity";
import {
	isServiceUnreachableError,
	messageManagerError,
	normalizeError,
	serviceUnreachableError,
} from "@trading-model/common/utils/errors";
import type { MessageMetadata } from "@trading-model/validation/domain/contracts/message.types";
import type { IMessageClient } from "../../domain/ports/i-message-client";
import type { MessageManagerConfig } from "../../domain/types/config";
import { TopicSubscriptionService } from "./topic-subscription-service";

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient implements IMessageClient {
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

	subscribe(topics: readonly string[]): Promise<void> {
		return this._subscriptionService.subscribe(topics as EventEnumMap[]);
	}

	unsubscribe(topics: readonly string[]): Promise<void> {
		return this._subscriptionService.unsubscribe(topics as EventEnumMap[]);
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
			URLString.of(`https://${HostPort.toAddress(target)}/message`),
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

	async publish<TPayload = unknown>(
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
