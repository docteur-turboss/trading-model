import { describe, expect, it, jest } from "@jest/globals";
import { RegistrationAttemptHandler } from "../../src/application/registration-attempt-handler";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: { error: jest.fn(), info: jest.fn() },
}));

function setup(registerService: () => Promise<{ token?: string }>) {
	const deps = {
		addressManagerClient: { registerService },
		tokenManager: { setToken: jest.fn() },
		onSuccess: jest.fn(),
		onFailure: jest.fn(),
	};
	return { deps, handler: new RegistrationAttemptHandler(deps as never) };
}

describe("RegistrationAttemptHandler", () => {
	it("stores the token and stops on the first success", async () => {
		const { deps, handler } = setup(async () => ({ token: "t" }));
		await handler.tryStickyRegistration();
		expect(deps.tokenManager.setToken).toHaveBeenCalledWith("t");
		expect(deps.onSuccess).toHaveBeenCalledTimes(1);
		expect(deps.onFailure).not.toHaveBeenCalled();
	});

	it("retries after a failure, then succeeds", async () => {
		jest.useFakeTimers();
		const register = jest
			.fn<() => Promise<{ token?: string }>>()
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({ token: "t" });
		const { deps, handler } = setup(register);
		const done = handler.tryStickyRegistration();
		await jest.advanceTimersByTimeAsync(3000);
		await done;
		expect(register).toHaveBeenCalledTimes(2);
		expect(deps.onFailure).toHaveBeenCalledTimes(1);
		expect(deps.tokenManager.setToken).toHaveBeenCalledWith("t");
		expect(jest.getTimerCount()).toBe(0);
		jest.useRealTimers();
	});

	it("stopRetrying ends the backoff wait and the loop at once", async () => {
		const register = jest
			.fn<() => Promise<{ token?: string }>>()
			.mockRejectedValue(new Error("down"));
		const { handler } = setup(register);
		const done = handler.tryStickyRegistration();
		await new Promise((r) => setImmediate(r));
		handler.stopRetrying();
		await done;
		expect(register).toHaveBeenCalledTimes(1);
	});
});
