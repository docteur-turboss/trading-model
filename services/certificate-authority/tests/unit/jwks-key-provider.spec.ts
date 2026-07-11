import type { KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFetch = jest.fn();
jest.mock("../../src/core/jwk-fetcher", () => {
	return {
		JwkFetcher: jest.fn().mockImplementation(() => ({
			fetch: mockFetch,
		})),
	};
});

import { JwksKeyProvider } from "../../src/core/jwks-key-provider";

describe("JwksKeyProvider", () => {
	let key1: KeyObject;
	let key2: KeyObject;

	beforeEach(() => {
		jest.clearAllMocks();
		key1 = { type: "public", Algorithm: "RSA" } as any;
		key2 = { type: "public", Algorithm: "RSA" } as any;
	});

	it("should resolve signing key by kid", async () => {
		mockFetch.mockResolvedValue([
			{ kid: "key-1", key: key1 },
			{ kid: "key-2", key: key2 },
		]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		const result = await provider.resolveSigningKey("key-1");
		expect(result).toBe(key1);
	});

	it("should resolve single key when no kid provided", async () => {
		mockFetch.mockResolvedValue([{ kid: "only-key", key: key1 }]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		const result = await provider.resolveSigningKey(undefined);
		expect(result).toBe(key1);
	});

	it("should throw when kid not found and multiple keys exist", async () => {
		mockFetch.mockResolvedValue([
			{ kid: "key-1", key: key1 },
			{ kid: "key-2", key: key2 },
		]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		await expect(provider.resolveSigningKey("nonexistent")).rejects.toThrow(
			"Signing key not found (kid: nonexistent)"
		);
	});

	it("should throw when no keys and no kid", async () => {
		mockFetch.mockResolvedValue([]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		await expect(provider.resolveSigningKey(undefined)).rejects.toThrow(
			"Signing key not found (kid: none)"
		);
	});

	it("should throw when JWKS URI not configured", async () => {
		const p = new JwksKeyProvider({ jwksUri: undefined as any });
		await expect(p.resolveSigningKey("key-1")).rejects.toThrow(
			"JWKS URI not configured"
		);
	});

	it("should use cached keys and not re-fetch within TTL", async () => {
		mockFetch.mockResolvedValue([{ kid: "key-1", key: key1 }]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		await provider.resolveSigningKey("key-1");
		expect(mockFetch).toHaveBeenCalledTimes(1);

		await provider.resolveSigningKey("key-1");
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("should log warning when refresh fails but cached keys exist", async () => {
		mockFetch.mockResolvedValue([{ kid: "key-1", key: key1 }]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		await provider.resolveSigningKey("key-1");
		expect(mockFetch).toHaveBeenCalledTimes(1);

		mockFetch.mockRejectedValue(new Error("Fetch failed"));

		jest.useFakeTimers();
		jest.advanceTimersByTime(3_600_001);

		await provider.resolveSigningKey("key-1");

		const logger = require("@trading-model/common/config/logger").logger;
		expect(logger.warn).toHaveBeenCalledWith(
			"JWKS refresh failed, using cached keys",
			expect.any(Object)
		);
		jest.useRealTimers();
	});

	it("should re-throw error when refresh fails and no cached keys", async () => {
		mockFetch.mockRejectedValue(new Error("Network error"));
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		await expect(provider.resolveSigningKey("key-1")).rejects.toThrow(
			"Network error"
		);
	});

	it("should log info on successful key refresh", async () => {
		mockFetch.mockResolvedValue([{ kid: "key-1", key: key1 }]);
		const provider = new JwksKeyProvider({
			jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
		});

		await provider.resolveSigningKey("key-1");

		const logger = require("@trading-model/common/config/logger").logger;
		expect(logger.info).toHaveBeenCalledWith("JWKS keys refreshed", {
			context: { count: 1 },
		});
	});
});
