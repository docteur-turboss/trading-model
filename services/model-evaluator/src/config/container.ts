import BrokerMessage from "@trading-model/broker-message";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createMessageHandler } from "../adapters/inbound/evaluation-subscriber";
import { FileEvaluationStore } from "../adapters/outbound/file-evaluation-store";
import { ScraperClient } from "../adapters/outbound/scraper-client";
import { TrainerClient } from "../adapters/outbound/trainer-client";
import { createEvaluateModel } from "../application/evaluate-model";
import { createServer } from "../application/server";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";

export type ModelEvaluatorApp = Awaited<
	ReturnType<typeof createModelEvaluatorApp>
>;

/** Wires the service: evaluation store, trainer and scraper clients, HTTP server and the model topic subscription. */
export async function createModelEvaluatorApp() {
	const tls = buildTlsFromEnv(ENV);
	const evaluate = createEvaluateModel({
		store: new FileEvaluationStore(ENV.EVALUATIONS_DIR),
		trainer: new TrainerClient(tls),
		scraper: new ScraperClient(tls),
	});
	const server = await createServer(createMessageHandler(evaluate));
	const brokerMessage = new BrokerMessage({
		journal: busJournalFromEnv(ENV),
		addressManagerClient: AddressManager,
		tlsPaths: tls,
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		serviceName: ServiceInstanceName.ModelEvaluatorService,
	});
	await brokerMessage.intents([TrainingEvent.ModelPublished]);
	return { server, brokerMessage };
}
