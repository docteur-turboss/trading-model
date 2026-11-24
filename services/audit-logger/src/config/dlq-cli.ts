import { HELPER } from "@trading-model/broker-message";
import { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import { publishToBus } from "@trading-model/broker-message/bus/publisher";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	DlqEvent,
	DlqEventMap,
} from "@trading-model/contracts/dlq-events";
import {
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { ENV } from "../infrastructure/config/env";

/** The bus of the operator CLI: dead streams and the `dlq.*` publisher, over the service's Redis settings. */
export function openDlqCli() {
	const journal = busJournalFromEnv(ENV);
	if (!journal) {
		throw new Error("the DLQ CLI needs the bus: BUS_TRANSPORT=library");
	}
	return {
		streams: new DeadStreams(journal),
		publish: <TEvent extends DlqEvent>(
			event: TEvent,
			payload: DlqEventMap[TEvent]
		) =>
			publishToBus(
				journal,
				payload,
				new HELPER.metadataBuilder(Topic.of(event), event, {
					instanceId: InstanceId.of(ENV.INSTANCE_ID),
					serviceName: ServiceId.of(ServiceInstanceName.AuditLoggerService),
				})
					.setDelivery({
						mode: DeliveryMode.AtLeastOnce,
						requireSubscriber: true,
					})
					.toJSON()
			),
	};
}
