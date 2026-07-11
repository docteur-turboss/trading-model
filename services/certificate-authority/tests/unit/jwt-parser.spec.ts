import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { JwtParser } from "../../src/core/jwt-parser";

describe("JwtParser", () => {
	let parser: JwtParser;

	beforeEach(() => {
		jest.clearAllMocks();
		parser = new JwtParser();
	});

	it("should parse a valid JWT token", () => {
		const header = Buffer.from(
			JSON.stringify({ alg: "RS256", typ: "JWT" })
		).toString("base64url");
		const payload = Buffer.from(JSON.stringify({ sub: "user-1" })).toString(
			"base64url"
		);
		const sigB64 = "dGVzdC1zaWduYXR1cmU";
		const token = `${header}.${payload}.${sigB64}`;

		const result = parser.parse(token);
		expect(result.header.alg).toBe("RS256");
		expect(result.payload).toEqual({ sub: "user-1" });
		expect(result.message).toBe(`${header}.${payload}`);
		expect(Buffer.isBuffer(result.signature)).toBe(true);
	});

	it("should throw on invalid JWT format (less than 3 parts)", () => {
		expect(() => parser.parse("invalid")).toThrow("Invalid JWT format");
	});

	it("should throw on invalid JWT format (empty parts)", () => {
		expect(() => parser.parse("..")).toThrow("Invalid JWT format");
	});

	it("should throw on invalid base64 in header", () => {
		const token = "!!!.e30.e30";
		expect(() => parser.parse(token)).toThrow("Failed to parse JWT segment");
	});

	it("should throw on invalid base64 in payload", () => {
		const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString(
			"base64url"
		);
		const token = `${header}.!!!.e30`;
		expect(() => parser.parse(token)).toThrow("Failed to parse JWT segment");
	});

	it("should parse with custom data type", () => {
		const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString(
			"base64url"
		);
		const payload = Buffer.from(
			JSON.stringify({ sub: "u1", roles: ["admin"] })
		).toString("base64url");
		const sig = Buffer.from("sig").toString("base64url");

		const result = parser.parse<{ sub: string; roles: string[] }>(
			`${header}.${payload}.${sig}`
		);
		expect(result.payload.roles).toEqual(["admin"]);
	});

	it("should parseBase64Json correctly", () => {
		const json = JSON.stringify({ a: 1, b: "2" });
		const encoded = Buffer.from(json).toString("base64url");
		const result = parser.parseBase64Json<{ a: number; b: string }>(encoded);
		expect(result).toEqual({ a: 1, b: "2" });
	});

	it("should throw parseBase64Json on invalid input", () => {
		expect(() => parser.parseBase64Json("!!!invalid")).toThrow(
			"Failed to parse JWT segment"
		);
	});

	it("should throw parseBase64Json on invalid json", () => {
		const encoded = Buffer.from("not-json").toString("base64url");
		expect(() => parser.parseBase64Json(encoded)).toThrow(
			"Failed to parse JWT segment"
		);
	});
});
