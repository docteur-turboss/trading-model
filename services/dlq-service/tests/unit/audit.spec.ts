import { describe, expect, it, jest } from "@jest/globals";

const MOCK_FIND_A_SERVICE = jest.fn();
const MOCK_POST = jest.fn();

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/env", () => ({
	ENV: {
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
	},
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: MOCK_FIND_A_SERVICE,
}));

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: jest.fn(() => ({
		post: MOCK_POST,
	})),
}));

jest.mock("@trading-model/common/domain/tls-paths", () => ({
	buildTlsFromEnv: jest.fn(() => ({})),
}));

let mockCircuitState: { isOpen: boolean };

jest.mock("@trading-model/common/reliability/circuit-state-machine", () => ({
	CircuitStateMachine: jest.fn(() => {
		let failures = 0;
		return {
			isOpen: () => mockCircuitState.isOpen,
			recordSuccess: () => {
				failures = 0;
			},
			recordFailure: () => {
				failures++;
			},
			getState: () => ({
				previousState: "closed",
				failures,
				halfOpenAttempts: 0,
			}),
		};
	}),
}));

describe("audit", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCircuitState = { isOpen: false };
		jest.resetModules();
	});

	it("should skip sending when circuit breaker is open", async () => {
		mockCircuitState = { isOpen: true };

		const { notifyAudit } = jest.requireActual("../../src/config/audit") as {
			notifyAudit: (event: { topic: string }) => Promise<void>;
		};

		await notifyAudit({ topic: "test" });

		expect(MOCK_POST).not.toHaveBeenCalled();
	});

	it("should resolve URL via FIND_A_SERVICE and send event", async () => {
		MOCK_FIND_A_SERVICE.mockResolvedValue({ ip: "10.0.0.1", port: 3000 });
		MOCK_POST.mockResolvedValue(undefined);

		const { notifyAudit } = jest.requireActual("../../src/config/audit") as {
			notifyAudit: (event: { topic: string }) => Promise<void>;
		};

		await notifyAudit({ topic: "test-topic" });

		expect(MOCK_FIND_A_SERVICE).toHaveBeenCalled();
		expect(MOCK_POST).toHaveBeenCalled();
	});

	it("should skip sending when URL resolution returns null", async () => {
		MOCK_FIND_A_SERVICE.mockResolvedValue(null);

		const { notifyAudit } = jest.requireActual("../../src/config/audit") as {
			notifyAudit: (event: { topic: string }) => Promise<void>;
		};

		await notifyAudit({ topic: "test-topic" });

		expect(MOCK_POST).not.toHaveBeenCalled();
	});

	it("should handle URL resolution error gracefully", async () => {
		MOCK_FIND_A_SERVICE.mockRejectedValue(new Error("resolution failed"));

		const { notifyAudit } = jest.requireActual("../../src/config/audit") as {
			notifyAudit: (event: { topic: string }) => Promise<void>;
		};

		await notifyAudit({ topic: "test-topic" });

		expect(MOCK_POST).not.toHaveBeenCalled();
	});

	it("should record failure on send error", async () => {
		MOCK_FIND_A_SERVICE.mockResolvedValue({ ip: "10.0.0.1", port: 3000 });
		MOCK_POST.mockRejectedValue(new Error("send failed"));

		const { notifyAudit } = jest.requireActual("../../src/config/audit") as {
			notifyAudit: (event: { topic: string }) => Promise<void>;
		};

		await notifyAudit({ topic: "test-topic" });

		expect(MOCK_POST).toHaveBeenCalled();
	});
});
