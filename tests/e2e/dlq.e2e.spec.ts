import { describe, expect, it } from "@jest/globals";
import { CALLER, meshRequest, signedDlqHeaders } from "./helpers";

const DLQ = "https://dlq-service:3000";

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
			headers: signedDlqHeaders(entry, "POST", "/dlq"),
		});
		expect(status).toBe(201);
		storedId = JSON.parse(body).id;
		expect(storedId).toEqual(expect.any(String));
	});

	it("lists the stored entry", () => {
		const { status, body } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			headers: signedDlqHeaders(undefined, "GET", "/dlq"),
		});
		expect(status).toBe(200);
		expect(JSON.stringify(JSON.parse(body).entries)).toContain(storedId);
	});

	it("rejects an unsigned request", () => {
		const { status } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			method: "POST",
			body: entry,
		});
		expect([401, 403]).toContain(status);
	});

	it("rejects a request signed with another secret", () => {
		const { status } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			method: "POST",
			body: entry,
			headers: signedDlqHeaders(entry, "POST", "/dlq", "not-the-secret"),
		});
		expect(status).toBe(401);
	});
});
