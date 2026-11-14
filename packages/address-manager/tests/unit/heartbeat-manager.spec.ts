import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

import { HeartbeatManager } from "../../src/application/heartbeat-manager";

function httpError(statusCode: number): Error {
	const cause = Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
	return Object.assign(new Error("Failed to refresh service TTL"), { cause });
}

describe("HeartbeatManager", () => {
	const registerService = jest.fn<() => Promise<{ token: string }>>();
	const refreshTTL = jest.fn<() => Promise<void>>();
	const setToken = jest.fn<(...args: any[]) => any>();
	const onSuccess = jest.fn<() => void>();
	const onFailure = jest.fn<() => void>();
	let manager: HeartbeatManager;
	const beat = () => manager.sendHeartbeat({} as never);

	beforeEach(() => {
		jest.clearAllMocks();
		registerService.mockResolvedValue({ token: "new-token" });
		manager = new HeartbeatManager({
			addressManagerClient: {
				registerService,
				refreshTTL,
				hasIpChanged: () => false,
			},
			tokenManager: { setToken },
			onSuccess,
			onFailure,
		} as never);
	});

	it("re-registers at once when discovery rejects the token (401)", async () => {
		refreshTTL.mockRejectedValueOnce(httpError(401));
		await beat();

		expect(registerService).toHaveBeenCalledTimes(1);
		expect(setToken).toHaveBeenCalledWith("new-token");
		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("re-registers at once when discovery removed the lease (404)", async () => {
		refreshTTL.mockRejectedValueOnce(httpError(404));
		await beat();

		expect(registerService).toHaveBeenCalledTimes(1);
		expect(setToken).toHaveBeenCalledWith("new-token");
	});

	it("waits for repeated failures before re-registering on other errors", async () => {
		refreshTTL.mockRejectedValue(httpError(503));
		await beat();
		await beat();
		expect(registerService).not.toHaveBeenCalled();
		expect(onFailure).toHaveBeenCalledTimes(2);

		await beat();
		expect(registerService).toHaveBeenCalledTimes(1);
		expect(onSuccess).not.toHaveBeenCalled();
	});
});
