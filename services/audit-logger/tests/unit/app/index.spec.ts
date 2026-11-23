import { beforeAll, describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
	debug: jest.fn<(...args: any[]) => any>(),
};

jest.mock("@trading-model/http/logger", () => ({
	logger: MOCK_LOGGER,
}));

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
	setLogger: jest.fn<(...args: any[]) => any>(),
}));

let capturedOptions: any;

jest.mock("@trading-model/http/bootstrap", () => ({
	createBootstrap: jest.fn((options: any) => {
		capturedOptions = options;
		return { server: null, shutdown: jest.fn<(...args: any[]) => any>() };
	}),
}));

jest.mock("@trading-model/http/telemetry", () => ({
	startTelemetry: jest.fn<(...args: any[]) => any>(),
	shutdownTelemetry: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		MONGODB_URI: "mongodb://localhost:27017/audit-logger",
		PORT: 3001,
		TLS_KEY_PATH: "/some/key.pem",
		TLS_CERT_PATH: "/some/cert.pem",
		TLS_CA_PATH: "/some/ca.pem",
		INSTANCE_ID: "instance-1",
		AUDIT_RETENTION_DAYS: 1827,
		AUDIT_CHAIN_INTERVAL_MS: 900000,
		AUDIT_ANCHOR_PREFIX: "audit-chain/",
		AUDIT_ANCHOR_REGION: "us-east-1",
		AUDIT_ANCHOR_REQUIRED: false,
	},
}));

const MOCK_CHAIN_AUDIT_SCHEDULER = {
	start: jest.fn<(...args: any[]) => any>(),
	stop: jest.fn<(...args: any[]) => any>(),
};
jest.mock("../../../src/application/audit-chain/chain-audit-scheduler", () => ({
	ChainAuditScheduler: jest.fn((..._args: any[]) => MOCK_CHAIN_AUDIT_SCHEDULER),
}));

const MOCK_ADDRESS_MANAGER = { stop: jest.fn<(...args: any[]) => any>() };
jest.mock("../../../src/config/address-manager", () => ({
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn((..._args: any[]) => MOCK_ADDRESS_MANAGER),
	AddressManager: { stop: jest.fn<(...args: any[]) => any>() },
	ADDRESS_MANAGER_ROUTES: jest.fn<(...args: any[]) => any>(),
}));

const MOCK_AUDIT_REPOSITORY_INSTANCE = {
	insert: jest.fn<(...args: any[]) => any>(),
	findById: jest.fn<(...args: any[]) => any>(),
	query: jest.fn<(...args: any[]) => any>(),
	getStats: jest.fn<(...args: any[]) => any>(),
	ensureIndexes: jest.fn<(...args: any[]) => any>(),
	warmStats: jest.fn<(...args: any[]) => any>(),
};

jest.mock(
	"../../../src/adapters/outbound/persistence/audit-repository",
	() => ({
		AuditRepository: jest.fn(
			(..._args: any[]) => MOCK_AUDIT_REPOSITORY_INSTANCE
		),
	})
);

jest.mock(
	"../../../src/adapters/outbound/persistence/retired-collections",
	() => ({ dropRetiredCollections: jest.fn<(...args: any[]) => any>() })
);

const MOCK_HTTP_SERVER = {};
jest.mock("../../../src/application/server", () => ({
	createServer: jest.fn((..._args: any[]) => MOCK_HTTP_SERVER),
}));

const MOCK_DB = { collection: jest.fn<(...args: any[]) => any>() };
const MOCK_MONGO_CLIENT = {
	connect: jest.fn<(...args: any[]) => any>(),
	db: jest.fn((..._args: any[]) => MOCK_DB),
	close: jest.fn<(...args: any[]) => any>(),
	on: jest.fn<(...args: any[]) => any>(),
};

jest.mock("mongodb", () => ({
	MongoClient: jest.fn((..._args: any[]) => MOCK_MONGO_CLIENT),
}));

const MOCK_BROKER_MESSAGE_INSTANCE = {
	on: jest.fn<(...args: any[]) => any>(),
	intents: jest.fn<(...args: any[]) => any>(),
	stopMessageManager: jest.fn<(...args: any[]) => any>(),
};

jest.mock("@trading-model/broker-message", () => {
	return {
		__esModule: true,
		default: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(() => MOCK_BROKER_MESSAGE_INSTANCE),
	};
});

jest.mock("@trading-model/contracts/audit-events", () => ({
	AuditEvent: {},
}));

import "../../../src/application/index";

jest.setTimeout(30000);

describe("Audit Logger entry point (index.ts)", () => {
	beforeAll(() => {
		expect(capturedOptions).toBeDefined();
	});

	it("starts, then stops and releases every resource once", async () => {
		expect(await capturedOptions.createServer()).toBe(MOCK_HTTP_SERVER);
		capturedOptions.onStart();
		await capturedOptions.onStop();
		await capturedOptions.onStop();

		expect(
			MOCK_BROKER_MESSAGE_INSTANCE.stopMessageManager
		).toHaveBeenCalledTimes(1);
		expect(MOCK_ADDRESS_MANAGER.stop).toHaveBeenCalledTimes(1);
		expect(MOCK_MONGO_CLIENT.close).toHaveBeenCalledTimes(1);
	});

	// The bus consumer (ADR-0073) records like POST /message: listeners registered before intents.
	it("registers a recording listener per audited topic before subscribing", async () => {
		const { on, intents } = MOCK_BROKER_MESSAGE_INSTANCE;
		const [topic, listener] = on.mock.calls.find(
			([name]) => name === "training.model.published"
		) as [string, (payload: unknown, metadata: unknown) => Promise<void>];
		expect(on.mock.invocationCallOrder[0]).toBeLessThan(
			intents.mock.invocationCallOrder[0]
		);

		await listener({ id: 1 }, { topic, messageId: "m-bus" });

		expect(MOCK_AUDIT_REPOSITORY_INSTANCE.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ topic, messageId: "m-bus" }),
				payload: { id: 1 },
			})
		);
	});

	it("listens while MongoDB is down, answers 503, then serves once it is up", async () => {
		const { createServer } = jest.requireMock(
			"../../../src/application/server"
		) as { createServer: jest.Mock<(...args: any[]) => any> };
		MOCK_MONGO_CLIENT.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
		createServer.mockClear();
		jest.useFakeTimers();

		await capturedOptions.createServer();
		const [repo, mongoManager, , isReady] = createServer.mock.calls[0];
		expect(mongoManager.isConnected()).toBe(false);
		expect(isReady()).toBe(false);
		expect(() => repo.findById("m1")).toThrow(/not ready/);

		await jest.advanceTimersByTimeAsync(3000);
		jest.useRealTimers();
		expect(mongoManager.isConnected()).toBe(true);
		expect(isReady()).toBe(true);
		expect(MOCK_AUDIT_REPOSITORY_INSTANCE.warmStats).toHaveBeenCalled();
		repo.findById("m1");
		expect(MOCK_AUDIT_REPOSITORY_INSTANCE.findById).toHaveBeenCalledWith("m1");
		capturedOptions.onStart();
		await capturedOptions.onStop();
	});
});
