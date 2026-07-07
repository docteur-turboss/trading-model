import type {
	DeliveryType,
	RoutingType,
	SecurityType,
} from "@trading-model/common/contracts/message.types";
import {
	DELIVERY_METADATA_MODE_PREDICATE,
	ROUTING_METADATA_CONTEXT_PREDICATE,
	SECURITY_METADATA_CONTEXT_PREDICATE,
} from "./message.schema";

export class MessageContext {
	public delivery?: DeliveryType;
	public routing?: RoutingType;
	public security?: SecurityType;

	setSecurity(context: SecurityType | null): void {
		if (context === null) {
			this.security = undefined;
			return;
		}
		SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);
		this.security = context;
	}
	setDelivery(context: DeliveryType | null): void {
		if (context === null) {
			this.delivery = undefined;
			return;
		}
		DELIVERY_METADATA_MODE_PREDICATE.parse(context);
		this.delivery = context;
	}
	setRouting(context: RoutingType | null): void {
		if (context === null) {
			this.routing = undefined;
			return;
		}
		ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);
		this.routing = context;
	}

	toJSON(): {
		delivery?: DeliveryType;
		routing?: RoutingType;
		security?: SecurityType;
	} {
		return {
			delivery: this.delivery,
			routing: this.routing,
			security: this.security,
		};
	}
}
