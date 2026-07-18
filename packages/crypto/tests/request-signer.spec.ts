import { ServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { HttpMethod } from "@trading-model/validation/contracts/signed-request";

const DEFAULT_TIMESTAMP_TOLERANCE_MS = 300_000;

import {
	buildSignedHeaders,
	extractRequestParts,
	normalizeBody,
	signRequest,
	verifySignature,
} from "../src/crypto/request-signer";

const longSecret = "this-is-a-long-secret-123456";
const shortSecret = "short";

function makeInput() {
	return {
		serviceName: ServiceId.of("test-service"),
		method: HttpMethod.Post,
		path: "/api/v1/test",
		body: { foo: "bar", num: 42 },
	};
}

describe("normalizeBody", () => {
	it("should return a copy of an object", () => {
		const original = { a: 1, b: { c: 2 } };
		const result = normalizeBody(original) as Record<string, unknown>;
		result.additionalProp = "new";
		expect(original).not.toHaveProperty("additionalProp");
	});

	it("should return {} for null", () => {
		expect(normalizeBody(null)).toEqual({});
	});

	it("should return {} for undefined", () => {
		expect(normalizeBody(undefined)).toEqual({});
	});

	it("should return the string itself (not an object)", () => {
		expect(normalizeBody("hello")).toBe("hello");
	});

	it("should return the number itself (not an object)", () => {
		expect(normalizeBody(123)).toBe(123);
	});
});

describe("signRequest", () => {
	it("should return an object with timestamp and signature", () => {
		const result = signRequest(makeInput(), longSecret);
		expect(result).toHaveProperty("timestamp");
		expect(result).toHaveProperty("signature");
		expect(typeof result.timestamp).toBe("string");
		expect(typeof result.signature).toBe("string");
	});

	it("should return a hex signature string", () => {
		const result = signRequest(makeInput(), longSecret);
		expect(result.signature).toMatch(/^[0-9a-f]+$/);
	});

	it("should return empty signature for short secrets (< 16 chars)", () => {
		const result = signRequest(makeInput(), shortSecret);
		expect(result.signature).toBe("");
	});

	it("should produce different signatures for different inputs", () => {
		const input1 = makeInput();
		const input2 = { ...makeInput(), path: "/api/v1/other" };
		const result1 = signRequest(input1, longSecret);
		const result2 = signRequest(input2, longSecret);
		expect(result1.signature).not.toBe(result2.signature);
	});

	it("should produce different signatures for different secrets", () => {
		const input = makeInput();
		const result1 = signRequest(input, `${longSecret}-aaa`);
		const result2 = signRequest(input, `${longSecret}-bbb`);
		expect(result1.signature).not.toBe(result2.signature);
	});
});

describe("verifySignature", () => {
	it("should return true for a valid signed request", () => {
		const input = makeInput();
		const auth = signRequest(input, longSecret);
		const result = verifySignature(input, {
			signature: auth.signature,
			timestamp: auth.timestamp,
			secret: longSecret,
		});
		expect(result).toBe(true);
	});

	it("should return false for empty signature", () => {
		const input = makeInput();
		const result = verifySignature(input, {
			signature: "" as never,
			timestamp: String(Date.now()) as never,
			secret: longSecret,
		});
		expect(result).toBe(false);
	});

	it("should return false for missing signature", () => {
		const input = makeInput();
		const result = verifySignature(input, {
			signature: undefined as never,
			timestamp: String(Date.now()) as never,
			secret: longSecret,
		});
		expect(result).toBe(false);
	});

	it("should return false for expired timestamp", () => {
		const input = makeInput();
		const auth = signRequest(input, longSecret);
		const ts = Number.parseInt(auth.timestamp, 10);
		jest
			.spyOn(Date, "now")
			.mockReturnValue(ts + DEFAULT_TIMESTAMP_TOLERANCE_MS + 1);
		const result = verifySignature(input, {
			signature: auth.signature,
			timestamp: auth.timestamp,
			secret: longSecret,
		});
		jest.restoreAllMocks();
		expect(result).toBe(false);
	});

	it("should return false for tampered body", () => {
		const input = makeInput();
		const auth = signRequest(input, longSecret);
		const tamperedInput = { ...input, body: { ...input.body, extra: "evil" } };
		const result = verifySignature(tamperedInput, {
			signature: auth.signature,
			timestamp: auth.timestamp,
			secret: longSecret,
		});
		expect(result).toBe(false);
	});

	it("should return false for wrong secret", () => {
		const input = makeInput();
		const auth = signRequest(input, longSecret);
		const result = verifySignature(input, {
			signature: auth.signature,
			timestamp: auth.timestamp,
			secret: "different-secret-that-is-long-enough",
		});
		expect(result).toBe(false);
	});
});

describe("buildSignedHeaders", () => {
	it("should return headers with x-timestamp, x-signature, x-service-name", () => {
		const input = makeInput();
		const headers = buildSignedHeaders(input, longSecret);
		expect(headers).toHaveProperty(HTTP_HEADERS.X_TIMESTAMP);
		expect(headers).toHaveProperty(HTTP_HEADERS.X_SIGNATURE);
		expect(headers).toHaveProperty(HTTP_HEADERS.X_SERVICE_NAME);
		expect(headers[HTTP_HEADERS.X_SERVICE_NAME]).toBe(input.serviceName);
	});

	it("should include a non-empty signature when secret is long enough", () => {
		const input = makeInput();
		const headers = buildSignedHeaders(input, longSecret);
		expect(headers[HTTP_HEADERS.X_SIGNATURE]).toBeTruthy();
		expect(
			(headers[HTTP_HEADERS.X_SIGNATURE] as string).length
		).toBeGreaterThan(0);
	});
});

describe("extractRequestParts", () => {
	it("should extract serviceName, signature, timestamp from headers", () => {
		const input = makeInput();
		const signedHeaders = buildSignedHeaders(input, longSecret);
		const result = extractRequestParts(
			signedHeaders as Record<string, string>,
			"POST",
			"/api/v1/test",
			{}
		);
		expect(result).not.toBeNull();
		expect(result!.serviceName).toBe(input.serviceName);
		expect(result!.signature).toBe(signedHeaders[HTTP_HEADERS.X_SIGNATURE]);
		expect(result!.timestamp).toBe(signedHeaders[HTTP_HEADERS.X_TIMESTAMP]);
	});

	it("should return null when x-service-name is missing", () => {
		const result = extractRequestParts(
			{
				[HTTP_HEADERS.X_TIMESTAMP]: "12345",
				[HTTP_HEADERS.X_SIGNATURE]: "abcdef",
			} as Record<string, string>,
			"GET",
			"/test",
			{}
		);
		expect(result).toBeNull();
	});

	it("should return null when x-signature is missing", () => {
		const result = extractRequestParts(
			{
				[HTTP_HEADERS.X_TIMESTAMP]: "12345",
				[HTTP_HEADERS.X_SERVICE_NAME]: "svc",
			} as Record<string, string>,
			"GET",
			"/test",
			{}
		);
		expect(result).toBeNull();
	});

	it("should return null when x-timestamp is missing", () => {
		const result = extractRequestParts(
			{
				[HTTP_HEADERS.X_SIGNATURE]: "abcdef",
				[HTTP_HEADERS.X_SERVICE_NAME]: "svc",
			} as Record<string, string>,
			"GET",
			"/test",
			{}
		);
		expect(result).toBeNull();
	});

	it("should return null when all headers are missing", () => {
		const result = extractRequestParts({}, "GET", "/test", {});
		expect(result).toBeNull();
	});
});
