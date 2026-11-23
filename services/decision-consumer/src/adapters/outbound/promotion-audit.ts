import { HELPER } from "@trading-model/broker-message";
import { createMessageManager } from "@trading-model/broker-message/create-message-manager";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { RiskEvent } from "@trading-model/contracts/risk-events";
import {
	type InstanceId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { AddressManager } from "../../config/address-manager";

/**
 * Publishes `risk.promotion.loaded` for the audit chain (ADR-0027, ADR-0087 §2).
 * No journal: the Redis users of the platform are not extended for a publish
 * through message-manager. A refusal throws, and the caller does not decide.
 */
export class PromotionAudit {
	private readonly _messages: ReturnType<
		typeof createMessageManager
	>["messageManager"];

	constructor(
		tls: TlsPaths,
		private readonly _instanceId: InstanceId,
		callbackPath: string
	) {
		this._messages = createMessageManager({
			addressManagerClient: AddressManager,
			tlsPaths: tls,
			instanceId: _instanceId,
			serviceName: ServiceInstanceName.DecisionConsumerService,
			callbackPath,
		}).messageManager;
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
