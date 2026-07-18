import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	SequenceNumber,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { sleep } from "@trading-model/common/utils/sleep";
import type { Message } from "@trading-model/validation/contracts/message.types";
import { resolveTarget } from "./address-resolver";
import { backoffDelay } from "./backoff-calculator";
import type { DeliveryErrorHandler } from "./delivery-error-handler";
import type { SubscribersContext } from "./delivery-metadata-extractor";
import type { DeliveryParams } from "./delivery-params";
import type {
	DeliverySendInput,
	MessageDeliveryPort,
} from "./message-delivery-port";

export interface DeliveryAttemptHandlerDeps {
	deliveryPort: MessageDeliveryPort;
	errorHandler: DeliveryErrorHandler;
	callbackPath: string;
	serviceName: ServiceInstanceName;
}

export class DeliveryAttemptHandler {
	private readonly _deliveryPort: MessageDeliveryPort;
	private readonly _errorHandler: DeliveryErrorHandler;
	private readonly _callbackPath: string;
	private readonly _serviceName: ServiceInstanceName;

	constructor(deps: DeliveryAttemptHandlerDeps) {
		this._deliveryPort = deps.deliveryPort;
		this._errorHandler = deps.errorHandler;
		this._callbackPath = deps.callbackPath;
		this._serviceName = deps.serviceName;
	}

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
		context.deliveryAttempt = (context.deliveryAttempt + 1) as SequenceNumber;

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
		const target = await resolveTarget(
			this._serviceName as unknown as ServiceId,
			this._callbackPath
		);

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
