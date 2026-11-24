import type addressManagerClient from "@trading-model/address-manager";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import type { HttpClient } from "@trading-model/http/http-client";
import { logger } from "@trading-model/http/logger";
import {
	DurationMs,
	InstanceId,
	ServiceId,
	Topic,
	URLString,
} from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { MessageClientPort } from "./ports/message-client.port";
import { messageManagerError } from "./shared/errors";
import { withTraceparent } from "./shared/trace-context";
import type { MessageManagerConfig } from "./types/config";
import type {
	SubscribesTopicsPayload,
	UnSubscribesTopicsPayload,
} from "./types/payloads";

/**
 * message-manager answers 202 once the message is journaled (ADR-0048). A
 * publish is never sent twice once it left: the broker stamps a new messageId on each
 * copy, so subscribers could not tell the duplicates apart.
 */
const PUBLISH_OPTIONS = {
	serviceName: ServiceId.of("message-manager"),
	timeoutMs: DurationMs.of(PUBLISH_ACCEPT_TIMEOUT_MS + 5_000),
};

/** Client for interacting with the Message Delivery Service via HTTP. */
export class MessageManagerClient implements MessageClientPort {
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
						instanceId: InstanceId.of(this._config.instanceId),
						serviceName: ServiceId.of(this._config.serviceName),
					},
					topic: Topic.of(topic),
				};
				// A subscription is an upsert: sending it twice is harmless.
				await this._httpClient.post(url, payload, {
					idempotent: true,
					serviceName: ServiceId.of("message-manager"),
				});
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
					topic: Topic.of(topic),
				};
				await this._httpClient.delete(url, payload, {
					serviceName: ServiceId.of("message-manager"),
				});
			}
		} catch (err) {
			logger.warn("Failed to unsubscribe topics from Message Manager", {
				context: { topics, error: normalizeError(err).message },
			});
		}
	}

	private async _subscribeUrl(): Promise<URLString> {
		const target = await this._addressManagerClient.findService(
			ServiceInstanceName.MessageManagerService
		);
		return URLString.of(`https://${HostPort.toAddress(target)}/subscribe`);
	}

	/** POST the message to message-manager. */
	private async _publishToService<TPayload = unknown>(
		target: HostPort,
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		await this._httpClient.post(
			URLString.of(`https://${HostPort.toAddress(target)}/message`),
			{ payload, metadata: withTraceparent(metadata) },
			PUBLISH_OPTIONS
		);
	}

	private _wrapError(error: unknown, message: string): never {
		throw messageManagerError(message, { cause: normalizeError(error) });
	}

	async publish<TPayload = unknown>(
		payload: TPayload,
		metadata: MessageMetadata
	): Promise<void> {
		try {
			const target = await this._addressManagerClient.findService(
				ServiceInstanceName.MessageManagerService
			);
			return await this._publishToService(target, payload, metadata);
		} catch (error) {
			this._wrapError(error, "Failed to publish message to Message Manager");
		}
	}
}
