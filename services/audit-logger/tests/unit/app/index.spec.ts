import { beforeAll, describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
};

jest.mock("@trading-model/common/config/logger", () => ({
	logger: MOCK_LOGGER,
}));

let capturedOptions: any;

jest.mock("@trading-model/common/server/bootstrap", () => ({
	createBootstrap: jest.fn((options: any) => {
		capturedOptions = options;
		return { server: null, shutdown: jest.fn() };
	}),
}));

jest.mock("../../../src/config/env", () => ({
	ENV: {
		MONGODB_URI: "mongodb://localhost:27017/audit-logger",
		PORT: 3001,
		MAX_QUEUE_DEPTH: 10000,
		ACK_TIMEOUT_MS: 30000,
		TLS_KEY_PATH: "/some/key.pem",
		TLS_CERT_PATH: "/some/cert.pem",
		TLS_CA_PATH: "/some/ca.pem",
		INSTANCE_ID: "instance-1",
	},
}));

jest.mock("@trading-model/address-manager/create-address-manager", () => ({
	createAddressManager: jest.fn(() => ({
		start: jest.fn(),
		stop: jest.fn(),
		listenExpress: jest.fn(),
	})),
}));

const MOCK_ADDRESS_MANAGER = { stop: jest.fn() };
jest.mock("../../../src/config/address-manager", () => ({
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn(() => MOCK_ADDRESS_MANAGER),
	AddressManager: { stop: jest.fn() },
	ADDRESS_MANAGER_ROUTES: jest.fn(),
}));

const MOCK_JOB_REPOSITORY_INSTANCE = {
	ensureIndexes: jest.fn<any>(),
	insert: jest.fn<any>(),
	findById: jest.fn<any>(),
	updateStatus: jest.fn<any>(),
	incrementRetry: jest.fn<any>(),
	findNonTerminal: jest.fn<any>(),
	findByWorker: jest.fn<any>(),
	findByStatus: jest.fn<any>(),
};

jest.mock("../../../src/persistence/job-repository", () => ({
	JobRepository: jest.fn(() => MOCK_JOB_REPOSITORY_INSTANCE),
}));

const MOCK_AUDIT_REPOSITORY_INSTANCE = {
	insert: jest.fn<any>(),
	insertBatch: jest.fn<any>(),
	findById: jest.fn<any>(),
	query: jest.fn<any>(),
	getStats: jest.fn<any>(),
	ensureIndexes: jest.fn<any>(),
};

jest.mock("../../../src/persistence/audit-repository", () => ({
	AuditRepository: jest.fn(() => MOCK_AUDIT_REPOSITORY_INSTANCE),
}));

const MOCK_SCHEDULER_INSTANCE = {
	workers: { register: jest.fn(), get: jest.fn(), unregister: jest.fn() },
	setWorkerProtocol: jest.fn<any>(),
	start: jest.fn<any>(),
	stop: jest.fn<any>(),
	onWorkerDisconnect: jest.fn(),
};

jest.mock("../../../src/scheduler/job-scheduler", () => ({
	JobScheduler: jest.fn(() => MOCK_SCHEDULER_INSTANCE),
}));

const MOCK_WORKER_PROTOCOL_INSTANCE = { close: jest.fn() };

jest.mock("../../../src/worker/worker-protocol", () => ({
	WorkerProtocol: jest.fn(() => MOCK_WORKER_PROTOCOL_INSTANCE),
}));

const MOCK_HTTP_SERVER = { raw: "mock-raw-server" };
jest.mock("../../../src/app/server", () => ({
	createServer: jest.fn(() => MOCK_HTTP_SERVER),
}));

const MOCK_DB = { collection: jest.fn() };
const MOCK_MONGO_CLIENT = {
	connect: jest.fn<any>(),
	db: jest.fn(() => MOCK_DB),
	close: jest.fn<any>(),
};

jest.mock("mongodb", () => ({
	MongoClient: jest.fn(() => MOCK_MONGO_CLIENT),
}));

const MOCK_BROKER_MESSAGE_INSTANCE = {
	intents: jest.fn<any>(),
	stopMessageManager: jest.fn<any>(),
};

jest.mock("@trading-model/broker-message", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => MOCK_BROKER_MESSAGE_INSTANCE),
	};
});

import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { createServer } from "../../../src/app/server";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../../../src/config/address-manager";
import { AuditRepository } from "../../../src/persistence/audit-repository";
import { JobRepository } from "../../../src/persistence/job-repository";
import { JobScheduler } from "../../../src/scheduler/job-scheduler";
import { WorkerProtocol } from "../../../src/worker/worker-protocol";

const MOCK_CREATE_BOOTSTRAP = createBootstrap as jest.Mock;

import "../../../src/app/index";

describe("Audit Logger entry point (index.ts)", () => {
	beforeAll(() => {
		expect(capturedOptions).toBeDefined();
	});

	it('should call createBootstrap with name "Audit Logger"', () => {
		expect(MOCK_CREATE_BOOTSTRAP).toHaveBeenCalledTimes(1);
		expect(capturedOptions.name).toBe("Audit Logger");
	});

	it("should handle onStop when all resources are null", async () => {
		await capturedOptions.onStop();

		expect(MOCK_SCHEDULER_INSTANCE.stop).not.toHaveBeenCalled();
		expect(MOCK_WORKER_PROTOCOL_INSTANCE.close).not.toHaveBeenCalled();
		expect(MOCK_ADDRESS_MANAGER.stop).not.toHaveBeenCalled();
		expect(MOCK_MONGO_CLIENT.close).not.toHaveBeenCalled();
	});

	describe("createServer callback", () => {
		it("should create all resources and return server", async () => {
			const server = await capturedOptions.createServer();

			expect(MOCK_MONGO_CLIENT.connect).toHaveBeenCalledTimes(1);
			expect(MOCK_MONGO_CLIENT.db).toHaveBeenCalledTimes(1);
			expect(JobRepository).toHaveBeenCalledWith(MOCK_DB);
			expect(MOCK_JOB_REPOSITORY_INSTANCE.ensureIndexes).toHaveBeenCalledTimes(
				1
			);
			expect(AuditRepository).toHaveBeenCalledWith(MOCK_DB);
			expect(
				MOCK_AUDIT_REPOSITORY_INSTANCE.ensureIndexes
			).toHaveBeenCalledTimes(1);
			expect(JobScheduler).toHaveBeenCalledWith(MOCK_JOB_REPOSITORY_INSTANCE);
			expect(createServer).toHaveBeenCalledWith(
				expect.objectContaining({
					workers: MOCK_SCHEDULER_INSTANCE.workers,
					setWorkerProtocol: MOCK_SCHEDULER_INSTANCE.setWorkerProtocol,
					start: MOCK_SCHEDULER_INSTANCE.start,
				}),
				MOCK_AUDIT_REPOSITORY_INSTANCE
			);
			expect(WorkerProtocol).toHaveBeenCalledWith(
				"mock-raw-server",
				expect.objectContaining({ register: expect.any(Function) }),
				expect.any(Function)
			);
			expect(MOCK_SCHEDULER_INSTANCE.setWorkerProtocol).toHaveBeenCalledWith(
				MOCK_WORKER_PROTOCOL_INSTANCE
			);
			expect(MOCK_SCHEDULER_INSTANCE.start).toHaveBeenCalledTimes(1);
			expect(server).toBe(MOCK_HTTP_SERVER);
		});

		it("should pass onWorkerDisconnect callback to WorkerProtocol", () => {
			const [, , disconnectCallback] = (WorkerProtocol as unknown as jest.Mock)
				.mock.calls[0];

			(disconnectCallback as any)("worker-1");

			expect(MOCK_SCHEDULER_INSTANCE.onWorkerDisconnect).toHaveBeenCalledWith(
				"worker-1"
			);
		});
	});

	describe("onStart callback", () => {
		it("should bootstrap address manager and log service info", () => {
			capturedOptions.onStart();

			expect(BOOTSTRAP_ADDRESS_MANAGER).toHaveBeenCalledTimes(1);
			expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
				"Audit Logger fully operational",
				expect.objectContaining({
					port: 3001,
					mongoUri: "mongodb://localhost:27017/audit-logger",
				})
			);
		});
	});

	describe("onStop callback", () => {
		it("should stop scheduler, close worker protocol, stop broker, stop address manager, close mongo client", async () => {
			await capturedOptions.onStop();

			expect(
				MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager
			).toHaveBeenCalledTimes(1);
			expect(MOCK_SCHEDULER_INSTANCE.stop).toHaveBeenCalledTimes(1);
			expect(MOCK_WORKER_PROTOCOL_INSTANCE.close).toHaveBeenCalledTimes(1);
			expect(MOCK_ADDRESS_MANAGER.stop).toHaveBeenCalledTimes(1);
			expect(MOCK_MONGO_CLIENT.close).toHaveBeenCalledTimes(1);
		});

		it("should handle onStop being idempotent", async () => {
			const prevCallCount =
				MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager.mock.calls.length;

			await capturedOptions.onStop();

			expect(
				MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager
			).toHaveBeenCalledTimes(prevCallCount + 1);
		});
	});
});
