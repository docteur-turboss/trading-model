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
import { MongoClient } from "mongodb";
import { importMongoDlq } from "../adapters/outbound/mongo-dlq-import";
import type { MongoDlqImportReport } from "../domain/mongo-dlq-import-report";
import { ENV } from "../infrastructure/config/env";

/** The bus of the operator CLI: dead streams and the `dlq.*` publisher, over the service's Redis settings. */
export function openDlqCli() {
	const journal = busJournalFromEnv(ENV);
	const streams = new DeadStreams(journal);
	return {
		streams,
		importMongo: async (): Promise<MongoDlqImportReport> => {
			const uri = process.env.MONGO_DLQ_URI;
			if (!uri) {
				throw new Error("MONGO_DLQ_URI is required");
			}
			const client = await MongoClient.connect(uri, {
				auth: {
					username: process.env.MONGO_DLQ_USERNAME,
					password: process.env.MONGO_DLQ_PASSWORD,
				},
			});
			try {
				return await importMongoDlq(
					client
						.db(process.env.MONGO_DLQ_DB ?? "dlq")
						.collection("dlq_entries"),
					streams
				);
			} finally {
				await client.close();
			}
		},
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
