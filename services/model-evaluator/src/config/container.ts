import BrokerMessage from "@trading-model/broker-message";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { EVENT_SUBSCRIBERS } from "@trading-model/contracts/event-routes";
import { ScraperClient } from "@trading-model/http/model-api/scraper-client";
import { TrainerClient } from "@trading-model/http/model-api/trainer-client";
import { InstanceId } from "@trading-model/primitives/primitives";
import { createMessageHandler } from "../adapters/inbound/evaluation-subscriber";
import { FileEvaluationStore } from "../adapters/outbound/file-evaluation-store";
import { createEvaluateModel } from "../application/evaluate-model";
import { createServer } from "../application/server";
import { ModelManifest } from "../domain/model-evaluation";
import { ENV } from "../infrastructure/config/env";
import { FIND_A_SERVICE } from "./address-manager";

export type ModelEvaluatorApp = Awaited<
	ReturnType<typeof createModelEvaluatorApp>
>;

/** Wires the service: evaluation store, trainer and scraper clients, HTTP server and the model topic subscription. */
export async function createModelEvaluatorApp() {
	const tls = buildTlsFromEnv(ENV);
	const evaluate = createEvaluateModel({
		store: new FileEvaluationStore(ENV.EVALUATIONS_DIR),
		trainer: new TrainerClient(
			tls,
			FIND_A_SERVICE,
			ModelManifest,
			ENV.TRAINER_MODEL_DIR
		),
		scraper: new ScraperClient(tls, FIND_A_SERVICE),
	});
	const server = await createServer();
	const brokerMessage = new BrokerMessage({
		journal: busJournalFromEnv(ENV),
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: ServiceInstanceName.ModelEvaluatorService,
	});
	await brokerMessage.intents(
		[...(EVENT_SUBSCRIBERS[ServiceInstanceName.ModelEvaluatorService] ?? [])],
		createMessageHandler(evaluate)
	);
	return { server, brokerMessage };
}
