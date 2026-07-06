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

export class MessageContextMetadata {
	public security?: SecurityType;
	public delivery?: DeliveryType;
	public routing?: RoutingType;

	public setSecurity(context: SecurityType | null): this {
		if (context === null) {
			this.security = undefined;
			return this;
		}

		SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);

		this.security = context;
		return this;
	}

	public setDelivery(context: DeliveryType | null): this {
		if (context === null) {
			this.delivery = undefined;
			return this;
		}

		DELIVERY_METADATA_MODE_PREDICATE.parse(context);

		this.delivery = context;
		return this;
	}

	public setRouting(context: RoutingType | null): this {
		if (context === null) {
			this.routing = undefined;
			return this;
		}

		ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);

		this.routing = context;
		return this;
	}

	public assignFromData(data: {
		routing?: RoutingType;
		delivery?: DeliveryType;
		security?: SecurityType;
	}): void {
		this.routing = data.routing;
		this.delivery = data.delivery;
		this.security = data.security;
	}
}
