import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";

const MOCK_LISTEN_EXPRESS = jest.fn();
const MOCK_MESSAGE_MANAGER_INSTANCE = {
	listenExpress: MOCK_LISTEN_EXPRESS,
};

jest.mock("../../src/index", () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => MOCK_MESSAGE_MANAGER_INSTANCE),
}));

jest.mock("@trading-model/address-manager", () => ({}));

import { createMessageManager } from "../../src/application/services/create-message-manager";

describe("createMessageManager", () => {
	const options = {
		addressManagerClient: {} as any,
		tlsPaths: {
			certPath: "/path/to/cert.pem",
			keyPath: "/path/to/key.pem",
			caPath: "/path/to/ca.pem",
		},
		instanceId: "550e8400-e29b-41d4-a716-446655440000",
		serviceName: ServiceInstanceName.MessageDeliveryService,
		callbackPath: "/callback",
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a MessageManager instance with correct options", () => {
		const MessageManagerClass = require("../../src/index").default;

		createMessageManager(options);

		expect(MessageManagerClass).toHaveBeenCalledWith({
			addressManagerClient: options.addressManagerClient,
			tlsPaths: options.tlsPaths,
			instanceId: options.instanceId,
			serviceName: options.serviceName,
			callbackPath: options.callbackPath,
		});
	});

	it("should return MessageManager instance and bound listenExpress", () => {
		const result = createMessageManager(options);

		expect(result.messageManager).toBe(MOCK_MESSAGE_MANAGER_INSTANCE);
		expect(result.messageManagerListenExpress).toBeDefined();

		result.messageManagerListenExpress({} as any);
		expect(MOCK_LISTEN_EXPRESS).toHaveBeenCalledWith({});
	});

	it("should return a bound listenExpress function", () => {
		const result = createMessageManager(options);

		expect(typeof result.messageManagerListenExpress).toBe("function");
		expect(result.messageManagerListenExpress.name).toContain("bound");
	});
});
