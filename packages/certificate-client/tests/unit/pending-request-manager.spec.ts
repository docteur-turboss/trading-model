import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { CaWssMessageType } from "../../src/auth-handler";
import {
	type CaSignResponse,
	PendingRequestManager,
} from "../../src/pending-request-manager";

describe("PendingRequestManager", () => {
	let manager: PendingRequestManager;

	beforeEach(() => {
		jest.useFakeTimers();
		manager = new PendingRequestManager();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	function makeSuccessResponse(id: string): CaSignResponse {
		return {
			type: CaWssMessageType.Response,
			id,
			success: true,
			data: {
				certPem: "cert" as any,
				caPem: "ca" as any,
				serialNumber: "SN" as any,
				expiresAt: "2027-01-01",
				fingerprint: "fp" as any,
			},
		} as CaSignResponse;
	}

	it("should create a pending request and resolve it on success response", async () => {
		const promise = manager.create("req-1");
		manager.handleResponse(makeSuccessResponse("req-1"));
		const result = await promise;
		expect(result).toBeDefined();
	});

	it("should reject on error response", async () => {
		const promise = manager.create("req-2");
		const response: CaSignResponse = {
			type: CaWssMessageType.SignResponse,
			id: "req-2",
			success: false,
			error: { message: "sign failed" },
		};
		manager.handleResponse(response);
		await expect(promise).rejects.toThrow("sign failed");
	});

	it("should use default error message when error has no message", async () => {
		const promise = manager.create("req-2b");
		const response: CaSignResponse = {
			type: CaWssMessageType.SignResponse,
			id: "req-2b",
			success: false,
		};
		manager.handleResponse(response);
		await expect(promise).rejects.toThrow("WSS request failed");
	});

	it("should reject on timeout", async () => {
		const promise = manager.create("req-3");
		jest.advanceTimersByTime(30000);
		await expect(promise).rejects.toThrow("WSS request timed out");
	});

	it("should ignore response for unknown id", () => {
		expect(() =>
			manager.handleResponse(makeSuccessResponse("unknown"))
		).not.toThrow();
	});

	it("should cancel a pending request", async () => {
		const promise = manager.create("req-4");
		manager.cancel("req-4", new Error("cancelled"));
		await expect(promise).rejects.toThrow("cancelled");
	});

	it("should cancel without error when no error provided", () => {
		const promise = manager.create("req-5");
		expect(() => manager.cancel("req-5")).not.toThrow();
		promise.catch(() => {});
	});

	it("should silently cancel non-existent id", () => {
		expect(() => manager.cancel("non-existent")).not.toThrow();
	});

	it("should reject all pending requests", async () => {
		const p1 = manager.create("r1");
		const p2 = manager.create("r2");
		manager.rejectAll(new Error("shutting down"));
		await expect(p1).rejects.toThrow("shutting down");
		await expect(p2).rejects.toThrow("shutting down");
	});

	it("should not throw on rejectAll when no pending requests", () => {
		expect(() => manager.rejectAll(new Error("none"))).not.toThrow();
	});
});
