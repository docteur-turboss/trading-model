import { describe, expect, it } from "@jest/globals";
import { CALLER, meshRequest, signedDlqHeaders } from "./helpers";

const DLQ = "https://dlq-service:3000";

describe("DLQ E2E", () => {
	it("reports MongoDB ready", () => {
		expect(meshRequest(CALLER.gateway, `${DLQ}/health/ready`).status).toBe(200);
	});

	it("lists the entries for a signed caller", () => {
		const { status } = meshRequest(CALLER.gateway, `${DLQ}/v1/dlq`, {
			headers: signedDlqHeaders(undefined, "GET", "/v1/dlq"),
		});
		expect(status).toBe(200);
	});

	it("no longer takes dead letters: they go to the dead streams (ADR-0073)", () => {
		const entry = { topic: "e2e.test.topic", message: {} };
		const { status } = meshRequest(CALLER.gateway, `${DLQ}/v1/dlq`, {
			method: "POST",
			body: entry,
			headers: signedDlqHeaders(entry, "POST", "/v1/dlq"),
		});
		expect(status).toBe(404);
	});
});
