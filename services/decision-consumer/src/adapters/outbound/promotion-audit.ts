import { HELPER } from "@trading-model/broker-message";
import { createServiceMessageManager } from "@trading-model/broker-message/create-message-manager";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { RiskEvent } from "@trading-model/contracts/risk-events";
import {
	type InstanceId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { ENV } from "../../infrastructure/config/env";

/**
 * Publishes `risk.promotion.loaded` for the audit chain (ADR-0027, ADR-0087 §2).
 * Goes through the bus journal in Redis (ADR-0073). A refusal throws, and the caller does not decide.
 */
export class PromotionAudit {
	private readonly _messages: ReturnType<
		typeof createServiceMessageManager
	>["messageManager"];

	constructor(private readonly _instanceId: InstanceId) {
		this._messages = createServiceMessageManager(ENV).messageManager;
	}

	async promotionLoaded(fields: {
		symbol: string;
		version: string;
		sha256: string;
	}): Promise<void> {
		const metadata = new HELPER.metadataBuilder(
			toTopic(RiskEvent.PromotionLoaded),
			RiskEvent.PromotionLoaded,
			{
				instanceId: this._instanceId,
				serviceName: toServiceId(ServiceInstanceName.DecisionConsumerService),
			}
		)
			.setDelivery({ mode: DeliveryMode.AtLeastOnce })
			.toJSON();
		await this._messages.post.indirect(fields, metadata);
	}
}
