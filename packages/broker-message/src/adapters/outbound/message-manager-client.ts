import type addressManagerClient from "@trading-model/address-manager";
import {
	isServiceUnreachableError,
	serviceUnreachableError,
} from "@trading-model/address-manager/shared/errors";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { PUBLISH_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { isNonRetryableClientError } from "@trading-model/http/infrastructure/http-retry";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	DurationMs,
	ServiceId,
	toInstanceId,
	toTopic,
	URLString,
} from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { IMessageClient } from "../../domain/ports/i-message-client";
import type { MessageManagerConfig } from "../../domain/types/config";
import type {
	SubscribesTopicsPayload,
	UnSubscribesTopicsPayload,
} from "../../domain/types/payloads";
import { messageManagerError } from "../../shared/errors";

/**
 * message-manager answers once it has delivered (or given up) the message:
 * wait for its answer rather than time out first. A publish is never sent
 * twice once it left: the broker stamps a new messageId on each copy, so
 * subscribers could not tell the duplicates apart.
 */
const PUBLISH_OPTIONS = {
	timeoutMs: DurationMs.of(PUBLISH_TIMEOUT_MS + 5_000),
};

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient implements IMessageClient {
	constructor(
		private readonly _httpClient: HttpClient,
		readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient
	) {}

	/** Subscribes the topics one by one: the first failure stops the pass. */
	async subscribe(topics: readonly string[]): Promise<void> {
		try {
			const url = await this._subscribeUrl();
			for (const topic of topics) {
				const payload: SubscribesTopicsPayload = {
					callbackPath: this._config.callbackPath,
					serviceIdentity: {
						instanceId: toInstanceId(this._config.instanceId),
						serviceName: ServiceId.of(this._config.serviceName),
					},
					topic: toTopic(topic),
				};
				// A subscription is an upsert: sending it twice is harmless.
				await this._httpClient.post(url, payload, { idempotent: true });
			}
		} catch (error) {
			this._wrapError(error, "Failed to subscribe topic to Message Manager");
		}
	}

	/**
	 * Best-effort: called on shutdown, where throwing would abort the remaining
	 * cleanup. Failures are logged so the leftover subscriptions are visible.
	 */
	async unsubscribe(topics: readonly string[]): Promise<void> {
		try {
			const url = await this._subscribeUrl();
			for (const topic of topics) {
				const payload: UnSubscribesTopicsPayload = {
					instanceId: this._config.instanceId,
					topic: toTopic(topic),
				};
				await this._httpClient.delete(url, payload);
			}
		} catch (err) {
			logger.warn("Failed to unsubscribe topics from Message Manager", {
				context: { topics, error: normalizeError(err).message },
			});
		}
	}

	private async _subscribeUrl(): Promise<URLString> {
		const target = await this._findService(
			ServiceInstanceName.MessageManagerService
		);
		return URLString.of(`https://${HostPort.toAddress(target)}/subscribe`);
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
				isNonRetryableClientError(status) &&
				status !== HTTP_STATUS.REQUEST_TIMEOUT;
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

	private _wrapError(error: unknown, message: string): never {
		if (isServiceUnreachableError(error)) {
			throw error;
		}
		throw messageManagerError(message, { cause: normalizeError(error) });
	}

	async publish<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._findService(
				ServiceInstanceName.MessageManagerService
			);
			return await this._publishToService(target, payload, metadata);
		} catch (error) {
			this._wrapError(error, "Failed to publish message to Message Manager");
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
			this._wrapError(error, `Failed to publish message to ${service}`);
		}
	}
}
