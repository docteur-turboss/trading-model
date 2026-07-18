import { logger } from "@trading-model/common/config/logger";
import { createBootstrap } from "@trading-model/server-utils/server/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { ENV } from "../config/env";
import { createBrokerMessage } from "./broker-setup";
import { createRepositories } from "./repository-factory";
import { createSchedulerAndWorker } from "./scheduler-factory";

interface CleanupContext {
	mongoManager: Awaited<ReturnType<typeof createRepositories>>["mongoManager"];
	scheduler: Awaited<ReturnType<typeof createSchedulerAndWorker>>["scheduler"];
	workerProtocol: Awaited<
		ReturnType<typeof createSchedulerAndWorker>
	>["workerProtocol"];
	brokerMessage: Awaited<
		ReturnType<typeof createBrokerMessage>
	>["brokerMessage"];
	addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;
}

let _context: CleanupContext | null = null;

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const { mongoManager, jobRepo, auditRepo } = await createRepositories(
			ENV.MONGODB_URI
		);
		const { scheduler, workerProtocol, server } =
			await createSchedulerAndWorker(jobRepo, auditRepo);
		const { brokerMessage } = await createBrokerMessage();

		_context = {
			mongoManager,
			scheduler,
			workerProtocol,
			brokerMessage,
			addressManager: null!,
		};

		return server;
	},
	onStart: () => {
		if (!_context) {
			return;
		}
		_context.addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	onStop: async () => {
		if (!_context) {
			return;
		}
		const {
			brokerMessage,
			scheduler,
			workerProtocol,
			addressManager,
			mongoManager,
		} = _context;
		await brokerMessage.stopMessageManager();
		scheduler.stop();
		workerProtocol.close();
		addressManager.stop();
		await mongoManager.close();
		_context = null;
	},
});
