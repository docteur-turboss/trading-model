import type addressManagerClient from "@trading-model/address-manager";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	isServiceUnreachableError,
	messageManagerError,
	normalizeError,
	serviceUnreachableError,
} from "@trading-model/common/utils/errors";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { DurationMs, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { IMessageClient } from "../../domain/ports/i-message-client";
import type { MessageManagerConfig } from "../../domain/types/config";
import { TopicSubscriptionService } from "./topic-subscription-service";

/**
 * message-manager answers 202 once the message is journaled (ADR-0043); the
 * older release answered 204 after delivery: both are success. A publish is
 * never sent twice once it left: the broker stamps a new messageId on each
 * copy, so subscribers could not tell the duplicates apart.
 */
const PUBLISH_OPTIONS = {
	timeoutMs: DurationMs.of(PUBLISH_ACCEPT_TIMEOUT_MS + 5_000),
	retryUnsentOnly: true,
};

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

	private async _findService(
		service: ServiceInstanceName
	): Promise<ServiceInstance> {
		const target = await this._addressManagerClient.findService(service);
		if (!target) {
			throw serviceUnreachableError(
				`Unable to contact the service: ${service}`
			);
		}
		return target;
	}

	/** POST the message and feed the outcome to the target instance's circuit breaker. */
	private async _publishToService<TPayload = unknown>(
		target: ServiceInstance,
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		const start = Date.now();
		try {
			await this._httpClient.post(
				URLString.of(`https://${HostPort.toAddress(target)}/message`),
				{ payload, metadata },
				PUBLISH_OPTIONS
			);
		} catch (error) {
			// A business 4xx proves the target is alive: it must not open the breaker.
			const status = (error as { statusCode?: number }).statusCode;
			const targetAnswered =
				status !== undefined &&
				status >= 400 &&
				status < 500 &&
				status !== 408 &&
				status !== 429;
			if (targetAnswered) {
				this._addressManagerClient.recordCallSuccess(
					target.instanceId,
					Date.now() - start
				);
			} else {
				this._addressManagerClient.recordCallFailure(
					target.instanceId,
					Date.now() - start
				);
			}
			throw error;
		}
		this._addressManagerClient.recordCallSuccess(
			target.instanceId,
			Date.now() - start
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
