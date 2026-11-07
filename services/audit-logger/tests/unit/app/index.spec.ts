import { beforeAll, describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
};

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: MOCK_LOGGER,
}));

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
	setLogger: jest.fn(),
}));

let capturedOptions: any;

jest.mock("@trading-model/server-utils/application/services/bootstrap", () => ({
	createBootstrap: jest.fn((options: any) => {
		capturedOptions = options;
		return { server: null, shutdown: jest.fn() };
	}),
}));

jest.mock("@trading-model/server-utils/infrastructure/telemetry", () => ({
	initializeTelemetry: jest.fn(),
	shutdownTelemetry: jest.fn(),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		MONGODB_URI: "mongodb://localhost:27017/audit-logger",
		PORT: 3001,
		TLS_KEY_PATH: "/some/key.pem",
		TLS_CERT_PATH: "/some/cert.pem",
		TLS_CA_PATH: "/some/ca.pem",
		INSTANCE_ID: "instance-1",
		ENFORCE_MTLS_STRICT: true,
		AUDIT_RETENTION_DAYS: 1827,
		AUDIT_CHAIN_INTERVAL_MS: 900000,
		AUDIT_ANCHOR_PREFIX: "audit-chain/",
		AUDIT_ANCHOR_REGION: "us-east-1",
		AUDIT_ANCHOR_REQUIRED: false,
	},
}));

const MOCK_CHAIN_AUDIT_SCHEDULER = { start: jest.fn(), stop: jest.fn() };
jest.mock("../../../src/application/audit-chain/chain-audit-scheduler", () => ({
	ChainAuditScheduler: jest.fn(() => MOCK_CHAIN_AUDIT_SCHEDULER),
}));

const MOCK_ADDRESS_MANAGER = { stop: jest.fn() };
jest.mock("../../../src/config/address-manager", () => ({
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn(() => MOCK_ADDRESS_MANAGER),
	AddressManager: { stop: jest.fn() },
	ADDRESS_MANAGER_ROUTES: jest.fn(),
}));

const MOCK_AUDIT_REPOSITORY_INSTANCE = {
	insert: jest.fn<any>(),
	findById: jest.fn<any>(),
	query: jest.fn<any>(),
	getStats: jest.fn<any>(),
	ensureIndexes: jest.fn<any>(),
};

jest.mock(
	"../../../src/adapters/outbound/persistence/audit-repository",
	() => ({
		AuditRepository: jest.fn(() => MOCK_AUDIT_REPOSITORY_INSTANCE),
	})
);

jest.mock(
	"../../../src/adapters/outbound/persistence/retired-collections",
	() => ({ dropRetiredCollections: jest.fn<any>() })
);

const MOCK_HTTP_SERVER = {};
jest.mock("../../../src/application/server", () => ({
	createServer: jest.fn(() => MOCK_HTTP_SERVER),
}));

const MOCK_DB = { collection: jest.fn() };
const MOCK_MONGO_CLIENT = {
	connect: jest.fn<any>(),
	db: jest.fn(() => MOCK_DB),
	close: jest.fn<any>(),
	on: jest.fn(),
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

jest.mock("@trading-model/contracts/market-events", () => ({
	MarketEvent: {},
}));
jest.mock("@trading-model/contracts/audit-events", () => ({
	AuditEvent: {},
}));

import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { AuditRepository } from "../../../src/adapters/outbound/persistence/audit-repository";
import { dropRetiredCollections } from "../../../src/adapters/outbound/persistence/retired-collections";
import { createServer } from "../../../src/application/server";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../../../src/config/address-manager";

const MOCK_CREATE_BOOTSTRAP = createBootstrap as jest.Mock;

import "../../../src/application/index";

jest.setTimeout(30000);

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

		expect(MOCK_ADDRESS_MANAGER.stop).not.toHaveBeenCalled();
		expect(MOCK_MONGO_CLIENT.close).not.toHaveBeenCalled();
	});

	describe("createServer callback", () => {
		it("should create all resources and return server", async () => {
			const server = await capturedOptions.createServer();

			expect(MOCK_MONGO_CLIENT.connect).toHaveBeenCalledTimes(1);
			expect(MOCK_MONGO_CLIENT.db).toHaveBeenCalledTimes(1);
			expect(AuditRepository).toHaveBeenCalledWith(MOCK_DB);
			expect(
				MOCK_AUDIT_REPOSITORY_INSTANCE.ensureIndexes
			).toHaveBeenCalledTimes(1);
			expect(dropRetiredCollections).toHaveBeenCalledWith(MOCK_DB);
			expect(createServer).toHaveBeenCalledWith(
				MOCK_AUDIT_REPOSITORY_INSTANCE,
				expect.anything(),
				expect.any(Function)
			);
			expect(server).toBe(MOCK_HTTP_SERVER);
		});
	});

	describe("onStart callback", () => {
		it("should bootstrap address manager and log service info", () => {
			capturedOptions.onStart();

			expect(BOOTSTRAP_ADDRESS_MANAGER).toHaveBeenCalledTimes(1);
			expect(MOCK_CHAIN_AUDIT_SCHEDULER.start).toHaveBeenCalledTimes(1);
			expect(MOCK_LOGGER.info).toHaveBeenNthCalledWith(
				3,
				"Audit Logger fully operational",
				expect.objectContaining({
					context: expect.objectContaining({
						port: 3001,
						mongoUri: "mongodb://localhost:27017/audit-logger",
					}),
				})
			);
		});
	});

	describe("onStop callback", () => {
		it("should stop the chain audit, broker, address manager and mongo client", async () => {
			await capturedOptions.onStop();

			expect(
				MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager
			).toHaveBeenCalledTimes(1);
			expect(MOCK_CHAIN_AUDIT_SCHEDULER.stop).toHaveBeenCalledTimes(1);
			expect(MOCK_ADDRESS_MANAGER.stop).toHaveBeenCalledTimes(1);
			expect(MOCK_MONGO_CLIENT.close).toHaveBeenCalledTimes(1);
		});

		it("should handle onStop being idempotent", async () => {
			const prevCallCount =
				MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager.mock.calls.length;

			await capturedOptions.onStop();

			expect(
				MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager
			).toHaveBeenCalledTimes(prevCallCount);
		});
	});
});
