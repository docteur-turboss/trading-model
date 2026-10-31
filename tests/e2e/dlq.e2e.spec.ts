import { describe, expect, it, jest } from "@jest/globals";
import {
	CALLER,
	computeDlqSignature,
	e2eTestTimeout,
	meshRequest,
} from "./helpers";

jest.setTimeout(e2eTestTimeout);

const DLQ = "https://dlq-service:3000";
const HMAC_SECRET = process.env.DLQ_AUTH_HMAC_SECRET ?? "test-hmac-secret";
/** Listed in DLQ_ALLOWED_SERVICES by the E2E overlay. */
const SERVICE_NAME = "e2e-test-runner";

function signedHeaders(
	body: unknown,
	method: string,
	path: string
): Record<string, string> {
	const timestamp = Date.now().toString();
	return {
		"x-service-name": SERVICE_NAME,
		"x-timestamp": timestamp,
		"x-signature": computeDlqSignature({
			serviceName: SERVICE_NAME,
			secret: HMAC_SECRET,
			body,
			timestamp,
			method,
			path,
		}),
	};
}

describe("DLQ E2E", () => {
	const entry = {
		topic: "e2e.test.topic",
		message: { key: "value", sequence: 1 },
		reason: "E2E test - simulated failure",
		deliveryAttempt: 3,
		timestamp: new Date().toISOString(),
	};

	it("reports MongoDB ready", () => {
		expect(meshRequest(CALLER.scraper, `${DLQ}/health/ready`).status).toBe(200);
	});

	let storedId = "";

	it("stores a signed dead letter entry", () => {
		const { status, body } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			method: "POST",
			body: entry,
			headers: signedHeaders(entry, "POST", "/dlq"),
		});
		expect(status).toBe(201);
		storedId = JSON.parse(body).id;
		expect(storedId).toEqual(expect.any(String));
	});

	it("lists the stored entry", () => {
		const { status, body } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			headers: signedHeaders(undefined, "GET", "/dlq"),
		});
		expect(status).toBe(200);
		const parsed = JSON.parse(body);
		const entries = parsed.entries ?? parsed.data?.entries ?? parsed;
		expect(JSON.stringify(entries)).toContain(storedId);
	});

	it("rejects an unsigned request", () => {
		const { status } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			method: "POST",
			body: entry,
		});
		expect([401, 403]).toContain(status);
	});

	it("rejects a request signed with another secret", () => {
		const timestamp = Date.now().toString();
		const { status } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			method: "POST",
			body: entry,
			headers: {
				"x-service-name": SERVICE_NAME,
				"x-timestamp": timestamp,
				"x-signature": computeDlqSignature({
					serviceName: SERVICE_NAME,
					secret: "not-the-secret",
					body: entry,
					timestamp,
					method: "POST",
					path: "/dlq",
				}),
			},
		});
		expect(status).toBe(401);
	});
});
