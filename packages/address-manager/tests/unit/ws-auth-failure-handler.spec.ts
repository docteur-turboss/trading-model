import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { WsAuthFailureDeps } from "../../src/application/ws-auth-failure-handler";
import { WsAuthFailureHandler } from "../../src/application/ws-auth-failure-handler";
import type { ServiceRegistrationResponse } from "../../src/domain/client/type";

function createDeps(): jest.Mocked<WsAuthFailureDeps> {
	return {
		addressManagerClient: {
			registerService:
				jest.fn<() => Promise<ServiceRegistrationResponse | undefined>>(),
		},
		tokenManager: {
			setToken: jest.fn<(token: string) => void>(),
		},
		wsClient: {
			updateToken: jest.fn<(token: string) => void>(),
		},
	} as never;
}

describe("WsAuthFailureHandler", () => {
	let handler: WsAuthFailureHandler;
	let deps: jest.Mocked<WsAuthFailureDeps>;

	beforeEach(() => {
		handler = new WsAuthFailureHandler();
		deps = createDeps();
	});

	it("should call registerService on handle and handle token success", async () => {
		deps.addressManagerClient.registerService.mockResolvedValue({
			token: "new-token",
		} as ServiceRegistrationResponse);
		handler.handle(deps);
		await new Promise(process.nextTick);
		expect(deps.addressManagerClient.registerService).toHaveBeenCalled();
		expect(deps.tokenManager.setToken).toHaveBeenCalledWith("new-token");
		expect(deps.wsClient!.updateToken).toHaveBeenCalledWith("new-token");
	});

	it("should not set token when registerService returns no token", async () => {
		deps.addressManagerClient.registerService.mockResolvedValue(
			{} as ServiceRegistrationResponse
		);
		handler.handle(deps);
		await new Promise(process.nextTick);
		expect(deps.tokenManager.setToken).not.toHaveBeenCalled();
		expect(deps.wsClient!.updateToken).not.toHaveBeenCalled();
	});

	it("should handle registerService returning undefined", async () => {
		deps.addressManagerClient.registerService.mockResolvedValue(undefined);
		handler.handle(deps);
		await new Promise(process.nextTick);
		expect(deps.tokenManager.setToken).not.toHaveBeenCalled();
	});

	it("should handle registerService error", async () => {
		deps.addressManagerClient.registerService.mockRejectedValue(
			new Error("reg error")
		);
		handler.handle(deps);
		await new Promise(process.nextTick);
		expect(deps.tokenManager.setToken).not.toHaveBeenCalled();
	});

	it("should handle undefined wsClient gracefully", async () => {
		deps.addressManagerClient.registerService.mockResolvedValue({
			token: "t",
		} as ServiceRegistrationResponse);
		const depsWithoutWs: jest.Mocked<WsAuthFailureDeps> = {
			addressManagerClient: deps.addressManagerClient,
			tokenManager: deps.tokenManager,
		} as never;
		handler.handle(depsWithoutWs);
		await new Promise(process.nextTick);
		expect(deps.tokenManager.setToken).toHaveBeenCalledWith("t");
	});
});
