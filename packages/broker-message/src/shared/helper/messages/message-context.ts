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

export interface MessageContextData {
	delivery?: DeliveryType;
	routing?: RoutingType;
	security?: SecurityType;
}

export class MessageContext {
	public readonly delivery?: DeliveryType;
	public readonly routing?: RoutingType;
	public readonly security?: SecurityType;

	constructor(data: MessageContextData = {}) {
		this.delivery = data.delivery;
		this.routing = data.routing;
		this.security = data.security;
	}

	withSecurity(context: SecurityType | null): MessageContext {
		if (context === null) {
			return new MessageContext({
				delivery: this.delivery,
				routing: this.routing,
			});
		}
		SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);
		return new MessageContext({
			delivery: this.delivery,
			routing: this.routing,
			security: context,
		});
	}
	withDelivery(context: DeliveryType | null): MessageContext {
		if (context === null) {
			return new MessageContext({
				routing: this.routing,
				security: this.security,
			});
		}
		DELIVERY_METADATA_MODE_PREDICATE.parse(context);
		return new MessageContext({
			routing: this.routing,
			security: this.security,
			delivery: context,
		});
	}
	withRouting(context: RoutingType | null): MessageContext {
		if (context === null) {
			return new MessageContext({
				delivery: this.delivery,
				security: this.security,
			});
		}
		ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);
		return new MessageContext({
			delivery: this.delivery,
			security: this.security,
			routing: context,
		});
	}

	toJSON(): MessageContextData {
		return {
			delivery: this.delivery,
			routing: this.routing,
			security: this.security,
		};
	}
}
