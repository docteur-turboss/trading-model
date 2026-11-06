import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Message } from "@trading-model/contracts/message-types";
import type {
	SequenceNumber,
	ServiceId,
} from "@trading-model/primitives/primitives";
import type { DeliveryParams } from "../../domain/delivery-params";
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import { resolveTarget } from "./address-resolver";
import type { DeliveryErrorHandler } from "./delivery-error-handler";

export interface DeliveryAttemptHandlerDeps {
	deliveryPort: MessageDeliveryPort;
	errorHandler: DeliveryErrorHandler;
	callbackPath: string;
	serviceName: ServiceInstanceName;
}

/**
 * What an attempt leaves to do with the journal entry: `delivered` and
 * `settled` (dead-lettered or dropped for good) are acknowledged, `retry`
 * stays pending until its next attempt is due.
 */
export type AttemptOutcome = "delivered" | "settled" | "retry";

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

	/** One attempt, the `deliveries`-th (1 for the first) of this message to this subscriber. */
	async attempt<TData>(
		message: Message<TData>,
		deliveries: number,
		deliveryParams: DeliveryParams
	): Promise<AttemptOutcome> {
		try {
			const target = await resolveTarget(
				this._serviceName as unknown as ServiceId,
				this._callbackPath
			);
			await this._deliveryPort.send({
				url: target,
				message,
				context: { deliveryAttempt: (deliveries - 1) as SequenceNumber },
			});
			return "delivered";
		} catch (err) {
			const handled = await this._errorHandler.handleDeliveryError(
				err,
				message,
				{ deliveryAttempt: deliveries as SequenceNumber },
				deliveryParams
			);
			return handled ? "settled" : "retry";
		}
	}
}
