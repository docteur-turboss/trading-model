import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { FilePath, URLString } from "../../../src/domain/primitives";

const MOCK_POST = jest.fn<any>();

jest.mock("../../../src/config/http-client", () => {
	const MockHttpClient: any = jest.fn(() => ({
		post: MOCK_POST,
	}));
	MockHttpClient.createWithTls = jest.fn(() => ({
		post: MOCK_POST,
	}));
	return { HttpClient: MockHttpClient };
});

import { AuditServiceClient } from "../../../src/config/audit-service-client";

describe("AuditServiceClient", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should not send when resolver returns null", async () => {
		const sanitizer = {
			safeStringify: (v: unknown) => JSON.stringify(v),
		} as never;
		const client = new AuditServiceClient(sanitizer, () =>
			Promise.resolve(null)
		);
		await client.send({ test: true });
	});

	it("should handle resolver that throws", async () => {
		const sanitizer = {
			safeStringify: (v: unknown) => JSON.stringify(v),
		} as never;
		const client = new AuditServiceClient(sanitizer, () =>
			Promise.reject(new Error("fail"))
		);
		await client.send({ test: true });
	});

	it("should use default resolver when none provided", async () => {
		const sanitizer = {
			safeStringify: (v: unknown) => JSON.stringify(v),
		} as never;
		const client = new AuditServiceClient(sanitizer);
		await client.send({ test: true });
	});

	it("should POST to audit endpoint when resolver returns a target", async () => {
		const sanitizer = {
			safeStringify: (v: unknown) => JSON.stringify(v),
		} as never;
		const client = new AuditServiceClient(sanitizer, () =>
			Promise.resolve({
				url: "https://audit.example.com" as URLString,
				tls: {
					caPath: "/etc/ca.pem" as FilePath,
					certPath: "/etc/cert.pem" as FilePath,
					keyPath: "/etc/key.pem" as FilePath,
				},
			})
		);
		MOCK_POST.mockResolvedValueOnce(undefined);
		await client.send({ test: true, key: "value" });
		expect(MOCK_POST).toHaveBeenCalledWith(
			"https://audit.example.com/api/logs",
			JSON.stringify({ test: true, key: "value" })
		);
	});
});
