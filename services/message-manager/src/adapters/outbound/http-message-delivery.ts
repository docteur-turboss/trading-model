import {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import type {
	DeadLetterInput,
	DeliverySendInput,
	MessageDeliveryPort,
} from "../../messaging/core/message-delivery-port";
import type { FileDlqRepository } from "./dlq-repository";

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
