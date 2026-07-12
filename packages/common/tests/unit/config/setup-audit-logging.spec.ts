import { describe, expect, it, jest } from "@jest/globals";
import { setupAuditLogging } from "../../../src/config/setup-audit-logging";
import type { HostPort } from "../../../src/domain/service-identity";

describe("setupAuditLogging", () => {
	it("should set audit resolver on logger", () => {
		const setAuditResolver = jest.fn<(fn: () => Promise<unknown>) => void>();
		const logger = { setAuditResolver, info: jest.fn() } as never;
		const addressManager = {
			findService: jest
				.fn<() => Promise<HostPort | null>>()
				.mockResolvedValue({ host: "127.0.0.1", port: 3000 }),
		} as never;
		const tlsPaths = {} as never;

		setupAuditLogging(logger, addressManager, tlsPaths);
		expect(setAuditResolver).toHaveBeenCalled();
	});

	it("should handle service not found", async () => {
		const setAuditResolver = jest.fn<(fn: () => Promise<unknown>) => void>();
		const logger = { setAuditResolver, info: jest.fn() } as never;
		const addressManager = {
			findService: jest.fn<() => Promise<null>>().mockResolvedValue(null),
		} as never;
		const tlsPaths = {} as never;

		setupAuditLogging(logger, addressManager, tlsPaths);
		expect(setAuditResolver).toHaveBeenCalled();
		const resolver = setAuditResolver.mock.calls[0][0];
		const result = await (resolver as () => Promise<unknown>)();
		expect(result).toBeNull();
	});

	it("should log on first resolution", async () => {
		const infoFn = jest.fn();
		const setAuditResolver = jest.fn<(fn: () => Promise<unknown>) => void>();
		const logger = { setAuditResolver, info: infoFn } as never;
		const addressManager = {
			findService: jest
				.fn<() => Promise<HostPort | null>>()
				.mockResolvedValue({ host: "10.0.0.1", port: 3000 }),
		} as never;
		const tlsPaths = {} as never;

		setupAuditLogging(logger, addressManager, tlsPaths);
		const resolver = setAuditResolver.mock.calls[0][0];
		const result = await (resolver as () => Promise<unknown>)();
		expect(infoFn).toHaveBeenCalledWith("audit-logger: connected", {
			url: "10.0.0.1:3000",
		});
		expect(result).toEqual({
			url: "https://10.0.0.1:3000",
			tls: {},
		});
	});

	it("should not log on subsequent resolutions", async () => {
		const infoFn = jest.fn();
		const setAuditResolver = jest.fn<(fn: () => Promise<unknown>) => void>();
		const logger = { setAuditResolver, info: infoFn } as never;
		const addressManager = {
			findService: jest
				.fn<() => Promise<HostPort | null>>()
				.mockResolvedValue({ host: "10.0.0.1", port: 3000 }),
		} as never;
		const tlsPaths = {} as never;

		setupAuditLogging(logger, addressManager, tlsPaths);
		const resolver = setAuditResolver.mock.calls[0][0];
		await (resolver as () => Promise<unknown>)();
		expect(infoFn).toHaveBeenCalledTimes(1);
		await (resolver as () => Promise<unknown>)();
		expect(infoFn).toHaveBeenCalledTimes(1);
	});

	it("should handle findService error", async () => {
		const setAuditResolver = jest.fn<(fn: () => Promise<unknown>) => void>();
		const logger = { setAuditResolver, info: jest.fn() } as never;
		const addressManager = {
			findService: jest
				.fn<() => Promise<HostPort | null>>()
				.mockRejectedValue(new Error("connection error")),
		} as never;
		const tlsPaths = {} as never;

		setupAuditLogging(logger, addressManager, tlsPaths);
		const resolver = setAuditResolver.mock.calls[0][0];
		const result = await (resolver as () => Promise<unknown>)();
		expect(result).toBeNull();
	});
});
