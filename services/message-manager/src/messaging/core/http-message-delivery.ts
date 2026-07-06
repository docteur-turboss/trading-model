import type { HttpClient } from "@trading-model/common/config/http-client";
import type { Message } from "@trading-model/common/contracts/message.types";

import type { DlqRepository } from "./dlq-repository";
import type {
	DeadLetterInput,
	DeliverySendInput,
	MessageDeliveryPort,
} from "./message-delivery-port";

export class HttpMessageDelivery implements MessageDeliveryPort {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _dqlRepository: DlqRepository
	) {}

	async send(input: DeliverySendInput): Promise<void> {
		const { url, message, context } = input;
		await this._httpClient.post(url, { message, context });
	}

	async markDeadLetter(input: DeadLetterInput): Promise<void> {
		const { message, reason, deliveryAttempt } = input;
		await this._dqlRepository.add({
			message,
			reason,
			deliveryAttempt,
			timestamp: new Date().toISOString(),
		});
	}
}
