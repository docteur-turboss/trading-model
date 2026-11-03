import { describe, expect, it } from "@jest/globals";
import { HTTP_HEADERS } from "../../src/http-headers";

describe("HTTP_HEADERS", () => {
	it("exposes the proxy headers", () => {
		expect(HTTP_HEADERS.X_FORWARDED_FOR).toBe("x-forwarded-for");
		expect(HTTP_HEADERS.X_FORWARDED_PROTO).toBe("x-forwarded-proto");
	});

	it("exposes the correlation headers", () => {
		expect(HTTP_HEADERS.X_REQUEST_ID).toBe("x-request-id");
		expect(HTTP_HEADERS.CORRELATION_ID).toBe("x-correlation-id");
	});

	it("exposes the service identity headers", () => {
		expect(HTTP_HEADERS.X_API_KEY).toBe("x-api-key");
		expect(HTTP_HEADERS.X_INSTANCE_TOKEN).toBe("x-instance-token");
		expect(HTTP_HEADERS.X_INSTANCE_ID).toBe("x-instance-id");
		expect(HTTP_HEADERS.X_SERVICE_NAME).toBe("x-service-name");
		expect(HTTP_HEADERS.X_SUBSCRIBED_TOPICS).toBe("x-subscribed-topics");
	});

	it("exposes the signed-request headers", () => {
		expect(HTTP_HEADERS.X_TIMESTAMP).toBe("x-timestamp");
		expect(HTTP_HEADERS.X_SIGNATURE).toBe("x-signature");
		expect(HTTP_HEADERS.X_VAULT_NAMESPACE).toBe("X-Vault-Namespace");
		expect(HTTP_HEADERS.CONTENT_TYPE).toBe("Content-Type");
	});
});
