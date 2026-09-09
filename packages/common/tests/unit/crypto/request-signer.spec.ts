import { describe, expect, it } from "@jest/globals";
import {
	buildSignedHeaders,
	extractRequestParts,
	normalizeBody,
	signRequest,
	verifySignature,
} from "@trading-model/crypto/domain/services/request-signer";
import { HTTP_HEADERS } from "../../../src/http-headers";

const secret = "test-secret-key-12345";
const method = "POST" as never;
const path = "/api/data";
const serviceName = "test-service" as never;
const body = { key: "value" };

describe("normalizeBody", () => {
	it("should clone an object", () => {
		const result = normalizeBody({ a: 1 });
		expect(result).toEqual({ a: 1 });
	});

	it("should return empty object for null", () => {
		expect(normalizeBody(null)).toEqual({});
	});

	it("should return empty object for undefined", () => {
		expect(normalizeBody(undefined)).toEqual({});
	});
});

describe("signRequest", () => {
	const input = { serviceName, method, path, body };

	it("should return timestamp and signature with valid secret", () => {
		const result = signRequest(input, secret);
		expect(result.timestamp).toBeTruthy();
		expect(result.signature).toBeTruthy();
		expect(result.signature.length).toBeGreaterThan(0);
	});

	it("should return empty signature for short secret", () => {
		const result = signRequest(input, "short");
		expect(result.signature).toBe("");
	});
});

describe("verifySignature", () => {
	const input = { serviceName, method, path, body };

	it("should verify a valid signature", () => {
		const { timestamp, signature } = signRequest(input, secret);
		expect(
			verifySignature(input, {
				signature,
				timestamp,
				secret,
			})
		).toBe(true);
	});

	it("should reject missing timestamp", () => {
		const { signature } = signRequest(input, secret);
		expect(
			verifySignature(input, {
				signature,
				timestamp: "" as never,
				secret,
			})
		).toBe(false);
	});

	it("should reject missing signature", () => {
		const { timestamp } = signRequest(input, secret);
		expect(
			verifySignature(input, {
				signature: "" as never,
				timestamp,
				secret,
			})
		).toBe(false);
	});

	it("should reject expired timestamp", () => {
		const { signature } = signRequest(input, secret);
		const oldTimestamp = String(Date.now() - 600_000);
		expect(
			verifySignature(input, {
				signature,
				timestamp: oldTimestamp as never,
				secret,
				toleranceMs: 1000,
			})
		).toBe(false);
	});

	it("should reject wrong secret", () => {
		const { timestamp, signature } = signRequest(input, secret);
		expect(
			verifySignature(input, {
				signature,
				timestamp,
				secret: "wrong-secret",
			})
		).toBe(false);
	});
});

describe("buildSignedHeaders", () => {
	it("should return headers with timestamp, signature, and service name", () => {
		const headers = buildSignedHeaders(
			{ serviceName, method, path, body },
			secret
		);
		expect(headers[HTTP_HEADERS.X_TIMESTAMP]).toBeTruthy();
		expect(headers[HTTP_HEADERS.X_SIGNATURE]).toBeTruthy();
		expect(headers[HTTP_HEADERS.X_SERVICE_NAME]).toBe(serviceName);
	});
});

describe("extractRequestParts", () => {
	it("should extract parts from valid headers", () => {
		const { timestamp, signature } = signRequest(
			{ serviceName, method, path, body },
			secret
		);
		const headers: Record<string, string> = {
			[HTTP_HEADERS.X_SERVICE_NAME]: serviceName as string,
			[HTTP_HEADERS.X_SIGNATURE]: signature as string,
			[HTTP_HEADERS.X_TIMESTAMP]: timestamp as string,
		};
		const result = extractRequestParts(headers, method as string, path, body);
		expect(result).not.toBeNull();
		expect(result!.serviceName).toBe(serviceName);
		expect(result!.signature).toBe(signature);
		expect(result!.timestamp).toBe(timestamp);
	});

	it("should return null for missing headers", () => {
		expect(extractRequestParts({}, method as string, path, body)).toBeNull();
	});
});
