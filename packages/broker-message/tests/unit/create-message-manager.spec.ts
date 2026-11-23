import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	FilePath,
	InstanceId,
} from "@trading-model/primitives/primitives";

const MOCK_MESSAGE_MANAGER_INSTANCE = {};

jest.mock("../../src/broker-message", () => ({
	__esModule: true,
	default: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => MOCK_MESSAGE_MANAGER_INSTANCE),
}));

jest.mock("@trading-model/address-manager", () => ({}));

import {
	busJournalFromEnv,
	createMessageManager,
} from "../../src/create-message-manager";

describe("busJournalFromEnv", () => {
	it("should keep the N-1 rule without BUS_TRANSPORT: no Redis settings, message-manager", () => {
		expect(
			busJournalFromEnv({
				REDIS_SENTINELS: "",
				REDIS_USERNAME: "trader-trainer",
			})
		).toBeUndefined();
	});

	it("should refuse BUS_TRANSPORT=library without Redis settings", () => {
		expect(() =>
			busJournalFromEnv({ BUS_TRANSPORT: "library", REDIS_SENTINELS: "" })
		).toThrow("BUS_TRANSPORT=library needs REDIS_URL or REDIS_SENTINELS");
	});

	it("should leave the bus to message-manager with BUS_TRANSPORT=http, even with Redis settings", () => {
		expect(
			busJournalFromEnv({
				BUS_TRANSPORT: "http",
				REDIS_URL: "redis://localhost:6379",
			})
		).toBeUndefined();
	});
});

describe("createMessageManager", () => {
	const options = {
		addressManagerClient: {} as any,
		tlsPaths: {
			certPath: "/path/to/cert.pem" as FilePath,
			keyPath: "/path/to/key.pem" as FilePath,
			caPath: "/path/to/ca.pem" as FilePath,
		},
		instanceId: "550e8400-e29b-41d4-a716-446655440000" as InstanceId,
		serviceName: ServiceInstanceName.MessageManagerService,
		callbackPath: "/callback",
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a MessageManager instance with correct options", () => {
		const MessageManagerClass = require("../../src/broker-message").default;

		createMessageManager(options);

		expect(MessageManagerClass).toHaveBeenCalledWith({
			addressManagerClient: options.addressManagerClient,
			tlsPaths: options.tlsPaths,
			instanceId: options.instanceId,
			serviceName: options.serviceName,
			callbackPath: options.callbackPath,
		});
	});

	it("should return MessageManager instance", () => {
		const result = createMessageManager(options);

		expect(result.messageManager).toBe(MOCK_MESSAGE_MANAGER_INSTANCE);
	});
});
