import type addressManagerClient from "@trading-model/address-manager";
import {
	isServiceUnreachableError,
	serviceUnreachableError,
} from "@trading-model/address-manager/shared/errors";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { HostPort } from "@trading-model/primitives/service-identity";
import type { MessageManagerConfig } from "../../domain/types/config";
import {
	isMessageManagerError,
	messageManagerError,
} from "../../shared/errors";
import { TopicRequestBuilder } from "./topic-request-builder";

export class TopicSubscriptionService {
	private readonly _requestBuilder: TopicRequestBuilder;

	constructor(
		readonly _httpClient: HttpClient,
		readonly _config: MessageManagerConfig,
		private readonly _addressManagerClient: addressManagerClient
	) {
		this._requestBuilder = new TopicRequestBuilder(_httpClient, _config);
	}

	async subscribe(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._findMessageService();
			await this._requestBuilder.subscribeAll(topics, target);
		} catch (err) {
			this._handleSubscribeError(err);
		}
	}

	/**
	 * Best-effort: called on shutdown, where throwing would abort the remaining
	 * cleanup. Failures are logged so the leftover subscriptions are visible.
	 */
	async unsubscribe(topics: EventEnumMap[]): Promise<void> {
		try {
			const target = await this._findMessageService();
			await this._requestBuilder.unsubscribeAll(topics, target);
		} catch (err) {
			logger.warn("Failed to unsubscribe topics from Message Manager", {
				context: { topics, error: normalizeError(err).message },
			});
		}
	}

	private async _findMessageService(): Promise<HostPort> {
		const target = await this._addressManagerClient.findService(
			ServiceInstanceName.MessageDeliveryService
		);
		if (!target) {
			throw serviceUnreachableError("Unable to contact the message manager");
		}
		return target;
	}

	private _handleSubscribeError(err: unknown): never {
		if (isServiceUnreachableError(err) || isMessageManagerError(err)) {
			throw err;
		}
		throw messageManagerError("Failed to subscribe topic to Message Manager", {
			cause: normalizeError(err),
		});
	}
}
