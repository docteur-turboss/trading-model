import type { HttpClient } from "@trading-model/common/config/http-client";
import type { Message } from "@trading-model/common/contracts/message.types";

import type { DqlRepository } from "./dlq-repository";
import type {
	MessageDeliveryContext,
	MessageDeliveryPort,
} from "./message-delivery-port";

export class HttpMessageDelivery implements MessageDeliveryPort {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _dqlRepository: DqlRepository
	) {}

	async send(
		url: string,
		message: Message,
		context: MessageDeliveryContext
	): Promise<void> {
		await this._httpClient.post(url, { message, context });
	}

	async markDeadLetter(
		message: Message,
		reason: string,
		deliveryAttempt: number
	): Promise<void> {
		await this._dqlRepository.add({
			message,
			reason,
			deliveryAttempt,
			timestamp: new Date().toISOString(),
		});
	}
}
