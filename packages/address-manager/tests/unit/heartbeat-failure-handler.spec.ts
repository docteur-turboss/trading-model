import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

import { HeartbeatFailureHandler } from "../../src/application/heartbeat-failure-handler";

function httpError(statusCode: number): Error {
	const cause = Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
	return Object.assign(new Error("Failed to refresh service TTL"), { cause });
}

describe("HeartbeatFailureHandler", () => {
	const registerService = jest.fn<() => Promise<{ token: string }>>();
	const setToken = jest.fn<(...args: any[]) => any>();
	let handler: HeartbeatFailureHandler;

	beforeEach(() => {
		jest.clearAllMocks();
		registerService.mockResolvedValue({ token: "new-token" });
		handler = new HeartbeatFailureHandler({
			addressManagerClient: {
				registerService,
				hasIpChanged: () => false,
			},
			tokenManager: { setToken },
		} as never);
	});

	it("re-registers at once when discovery rejects the token (401)", async () => {
		await handler.handleError(httpError(401));

		expect(registerService).toHaveBeenCalledTimes(1);
		expect(setToken).toHaveBeenCalledWith("new-token");
	});

	it("waits for repeated failures before re-registering on other errors", async () => {
		await handler.handleError(httpError(503));
		await handler.handleError(httpError(503));
		expect(registerService).not.toHaveBeenCalled();

		await handler.handleError(httpError(503));
		expect(registerService).toHaveBeenCalledTimes(1);
	});
});
