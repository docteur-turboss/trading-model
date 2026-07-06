import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";

export interface MetadataState {
	topic: string;
	routing?: RoutingType;
	delivery?: DeliveryType;
	security?: SecurityType;
	eventType: string;
	publisher: ServiceIdentity;
	schemaVersion: string;
	causationId?: string;
	correlationId?: string;
}

export class MetadataSerializer {
	toJSON(state: MetadataState): MetadataType {
		return this._buildMetadata(state);
	}

	private _buildMetadata(state: MetadataState): MetadataType {
		return {
			eventType: state.eventType,
			publisher: state.publisher,
			schemaVersion: state.schemaVersion,
			topic: state.topic,
			causationId: state.causationId,
			correlationId: state.correlationId,
			delivery: state.delivery,
			routing: state.routing,
			security: state.security,
		};
	}
}
