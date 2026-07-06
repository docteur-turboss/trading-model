import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { sleep } from "@trading-model/common/utils/sleep";
import { FIND_A_SERVICE } from "../../config/address-manager";
import type { DeliveryErrorHandler } from "./delivery-error-handler";
import type { SubscribersContext } from "./delivery-metadata-extractor";
import type {
	DeliverySendInput,
	MessageDeliveryContext,
	MessageDeliveryPort,
} from "./message-delivery-port";

const BaseDelayMs = 1000;
const MaxDelayMs = 60_000;
const JitterFactor = 0.2;

export class DeliveryAttemptHandler {
	constructor(
		private readonly _deliveryPort: MessageDeliveryPort,
		private readonly _errorHandler: DeliveryErrorHandler,
		private readonly _callbackURL: string,
		private readonly _serviceName: string
	) {}

	static backoffDelay(deliveryAttempt: number): number {
		const delay = computeExponentialBackoff(deliveryAttempt, {
			baseDelayMs: BaseDelayMs,
			maxDelayMs: MaxDelayMs,
		});
		const jitter = delay * JitterFactor * (Math.random() * 2 - 1);
		return Math.max(0, Math.round(delay + jitter));
	}

	async attempt<TData>(
		message: Message<TData>,
		context: SubscribersContext,
		ttl: number,
		emittedAt: number,
		deliveryMode: DeliveryMode
	): Promise<boolean> {
		try {
			const target = await this._resolveTarget();

			const deliveryContext: MessageDeliveryContext = {
				deliveryAttempt: context.deliveryAttempt,
				consumerGroup: context.consumerGroup,
			};
			const sendInput: DeliverySendInput = {
				url: target,
				message,
				context: deliveryContext,
			};
			await this._deliveryPort.send(sendInput);

			context.receivedAt = new Date();
			await context.ack();
			return false;
		} catch (err) {
			context.deliveryAttempt++;

			const handled = await this._errorHandler.handleDeliveryError(
				err,
				message,
				context,
				ttl,
				emittedAt,
				deliveryMode
			);
			if (handled) {
				return false;
			}

			await sleep(DeliveryAttemptHandler.backoffDelay(context.deliveryAttempt));
		}

		if (
			deliveryMode === DeliveryMode.EXACTLY_ONCE ||
			deliveryMode === DeliveryMode.AT_MOST_ONCE
		) {
			return false;
		}

		return true;
	}

	private async _resolveTarget(): Promise<string> {
		const address = await FIND_A_SERVICE(this._serviceName);

		return `https://${address.ip}:${address.port}/${this._callbackURL}`;
	}
}
