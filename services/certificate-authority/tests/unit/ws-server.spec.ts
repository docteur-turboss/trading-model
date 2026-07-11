import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: (err: Error) => err,
}));

const MOCK_DISTRIBUTOR = {
	requestCertificate: jest.fn(),
};

jest.mock("../../src/app/index", () => ({
	container: {
		distributor: MOCK_DISTRIBUTOR,
	},
}));

jest.mock("../../src/app/ws-response-formatter", () => ({
	buildSignResponsePayload: jest.fn((id: string) =>
		JSON.stringify({ type: "sign:response", id, success: true })
	),
	buildSignErrorPayload: jest.fn((id: string, code: number) =>
		JSON.stringify({
			type: "sign:response",
			id,
			success: false,
			error: { code },
		})
	),
	sendRateLimitError: jest.fn(),
	sendSignError: jest.fn(),
	sendJsonError: jest.fn(),
}));

const { attachWsServer } = jest.requireActual("../../src/app/ws-server");

describe("ws-server", () => {
	let httpServer: any;

	beforeEach(() => {
		jest.clearAllMocks();
		httpServer = { on: jest.fn() };
	});

	it("should attach WebSocket server to HTTPS server", () => {
		const wss = attachWsServer(httpServer, jest.fn());
		expect(wss).toBeDefined();
	});

	it("should export attachWsServer function", () => {
		expect(attachWsServer).toBeDefined();
		expect(typeof attachWsServer).toBe("function");
	});
});
