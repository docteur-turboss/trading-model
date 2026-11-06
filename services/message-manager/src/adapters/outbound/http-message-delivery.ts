import { deadLetterError } from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { isHttpClientError } from "@trading-model/http/adapters/outbound/http-client-errors";
import {
	DurationMs,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { DeadLetterStorePort } from "../../application/ports/dead-letter-store-port";
import type {
	DeadLetterInput,
	DeliverySendInput,
	MessageDeliveryPort,
} from "../../application/ports/message-delivery-port";
import { MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import { DlqReason } from "../../domain/delivery-error-classifier";

/**
 * One delivery attempt. The dispatcher owns the retries (backoff, dead
 * letters): the HTTP client must not retry on its own underneath it.
 */
export const DELIVERY_ATTEMPT_TIMEOUT_MS = DurationMs.of(10_000);

/**
 * Answers saying the message itself is wrong (the subscriber's callback
 * returns 400 when the payload fails its topic schema): resending it cannot
 * succeed, so it is dead-lettered at once instead of after 10 attempts.
 * Auth, routing, throttling and server errors may pass and keep the retries.
 */
const REJECTED_STATUSES: ReadonlySet<number> = new Set([
	HTTP_STATUS.BAD_REQUEST,
	HTTP_STATUS.PAYLOAD_TOO_LARGE,
	HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
	HTTP_STATUS.UNPROCESSABLE_ENTITY,
]);

export class HttpMessageDelivery implements MessageDeliveryPort {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _deadLetters: DeadLetterStorePort
	) {}

	async send(input: DeliverySendInput): Promise<void> {
		const { url, message, context } = input;
		// Subscribers (broker-message MESSAGE_CONTROLLER) read `metadata` and
		// `payload` at the top level of the body: wrapping them got every delivery a 400.
		try {
			await this._httpClient.post(
				url,
				{ metadata: message.metadata, payload: message.payload, context },
				{ timeoutMs: DELIVERY_ATTEMPT_TIMEOUT_MS, retryCount: 0 }
			);
		} catch (err) {
			if (
				isHttpClientError(err) &&
				err.statusCode !== undefined &&
				REJECTED_STATUSES.has(err.statusCode)
			) {
				throw deadLetterError(err.message, {
					cause: err,
					reason: DlqReason.RejectedBySubscriber,
				});
			}
			throw err;
		}
	}

	async markDeadLetter(input: DeadLetterInput): Promise<void> {
		const { message, reason, deliveryAttempt } = input;
		MESSAGES_DLQ_TOTAL.inc({ topic: message.metadata.topic, reason });
		await this._deadLetters.insert({
			// dlq-service lists and replays dead letters by topic.
			topic: message.metadata.topic,
			message,
			reason,
			deliveryAttempt: PositiveInt.of(deliveryAttempt),
			timestamp: UnixTimestamp.now(),
		});
	}
}
