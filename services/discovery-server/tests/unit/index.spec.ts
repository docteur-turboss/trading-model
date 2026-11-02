import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/server-utils/application/services/bootstrap", () => ({
	createBootstrap: jest.fn(),
}));

jest.mock("../../src/application/server", () => ({
	createServer: jest.fn(),
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		PORT: 3000,
		TLS_KEY_PATH: "/key",
		TLS_CERT_PATH: "/cert",
		TLS_CA_PATH: "/ca",
		CLEANUP_SERVICE_INTERVAL_MS: 5000,
		ERROR_URL_WEBHOOK: "https://hooks.example.com/error",
		REDIS_URL: "redis://localhost:6379",
		SIGNING_SECRET: "signing-secret",
	},
}));

jest.mock("../../src/domain/service-registry", () => {
	const { ServiceRegistry } = jest.requireActual(
		"../../src/domain/service-registry"
	);
	return { ServiceRegistry };
});

jest.mock("../../src/domain/lease-manager", () => {
	const { LeaseManager } = jest.requireActual("../../src/domain/lease-manager");
	return { LeaseManager };
});

const mockRedisClient = {
	connect: jest.fn().mockResolvedValue(undefined),
	ping: jest.fn().mockResolvedValue("PONG"),
	disconnect: jest.fn(),
};

jest.mock("@trading-model/persistence/redis-connection-manager", () => ({
	createRedisClient: jest.fn(() => mockRedisClient),
}));

jest.mock("../../src/adapters/outbound/redis-instance-store", () => ({
	RedisInstanceStore: jest.fn().mockImplementation(() => ({
		deps: { redis: mockRedisClient, keyPrefix: "trading-model:discovery" },
	})),
}));

describe("app/index", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should call createBootstrap with correct options on load", () => {
		const { createBootstrap } = jest.requireMock(
			"@trading-model/server-utils/application/services/bootstrap"
		) as {
			createBootstrap: jest.Mock;
		};
		const { createServer } = jest.requireMock(
			"../../src/application/server"
		) as {
			createServer: jest.Mock;
		};

		require("../../src/application/index");

		expect(createBootstrap).toHaveBeenCalledTimes(1);
		expect(createBootstrap).toHaveBeenCalledWith({
			name: "Discovery",
			createServer: expect.any(Function),
			onStart: expect.any(Function),
			onStop: expect.any(Function),
		});

		const opts = createBootstrap.mock.calls[0][0] as {
			createServer: () => void;
			onStart: () => void;
			onStop: () => void;
		};

		opts.createServer();
		expect(createServer).toHaveBeenCalled();

		opts.onStart();

		opts.onStop();
	});

	it("should use RedisInstanceStore when REDIS_URL is set", () => {
		jest.resetModules();

		require("../../src/application/index");

		const { createBootstrap } = jest.requireMock(
			"@trading-model/server-utils/application/services/bootstrap"
		) as {
			createBootstrap: jest.Mock;
		};

		const opts = createBootstrap.mock.calls.at(-1)![0] as {
			createServer: () => void;
			onStart: () => void;
			onStop: () => void;
		};

		opts.createServer();
		opts.onStart();
		opts.onStop();
	});
});
