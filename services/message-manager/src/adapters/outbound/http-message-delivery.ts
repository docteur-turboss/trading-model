import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type {
	DeadLetterInput,
	DeliverySendInput,
	MessageDeliveryPort,
} from "../../application/ports/message-delivery-port";
import { MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import type { FileDlqRepository } from "../../infrastructure/fallback/dlq-repository";

export class HttpMessageDelivery implements MessageDeliveryPort {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _dqlRepository: FileDlqRepository
	) {}

	async send(input: DeliverySendInput): Promise<void> {
		const { url, message, context } = input;
		await this._httpClient.post(url, { message, context });
	}

	async markDeadLetter(input: DeadLetterInput): Promise<void> {
		const { message, reason, deliveryAttempt } = input;
		MESSAGES_DLQ_TOTAL.inc({ topic: message.metadata.topic, reason });
		await this._dqlRepository.insert({
			message,
			reason,
			deliveryAttempt: PositiveInt.of(deliveryAttempt),
			timestamp: UnixTimestamp.now(),
		});
	}
}
