import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import { sleep } from "@trading-model/common/utils/sleep";
import { resolveTarget } from "./address-resolver";
import { backoffDelay } from "./backoff-calculator";
import type { DeliveryErrorHandler } from "./delivery-error-handler";
import type { SubscribersContext } from "./delivery-metadata-extractor";
import type { DeliveryParams } from "./delivery-params";
import type {
	DeliverySendInput,
	MessageDeliveryPort,
} from "./message-delivery-port";

export class DeliveryAttemptHandler {
	constructor(
		private readonly _deliveryPort: MessageDeliveryPort,
		private readonly _errorHandler: DeliveryErrorHandler,
		private readonly _callbackURL: string,
		private readonly _serviceName: ServiceInstanceName
	) {}

	async attempt<TData>(
		message: Message<TData>,
		context: SubscribersContext,
		deliveryParams: DeliveryParams
	): Promise<boolean> {
		try {
			return await this._tryDeliver(message, context);
		} catch (err) {
			return this._handleDeliveryError(err, message, context, deliveryParams);
		}
	}

	private async _handleDeliveryError<TData>(
		err: unknown,
		message: Message<TData>,
		context: SubscribersContext,
		deliveryParams: DeliveryParams
	): Promise<boolean> {
		context.deliveryAttempt++;

		const handled = await this._errorHandler.handleDeliveryError(
			err,
			message,
			context,
			deliveryParams
		);
		if (handled) {
			return false;
		}

		await sleep(backoffDelay(context.deliveryAttempt));
		return this._shouldRetry(deliveryParams.deliveryMode);
	}

	private async _tryDeliver<TData>(
		message: Message<TData>,
		context: SubscribersContext
	): Promise<boolean> {
		const target = await resolveTarget(this._serviceName, this._callbackURL);

		const sendInput: DeliverySendInput = {
			url: target,
			message,
			context: {
				deliveryAttempt: context.deliveryAttempt,
				consumerGroup: context.consumerGroup,
			},
		};
		await this._deliveryPort.send(sendInput);

		await context.ack();
		return false;
	}

	private _shouldRetry(deliveryMode: DeliveryMode): boolean {
		if (
			deliveryMode === DeliveryMode.ExactlyOnce ||
			deliveryMode === DeliveryMode.AtMostOnce
		) {
			return false;
		}
		return true;
	}
}
