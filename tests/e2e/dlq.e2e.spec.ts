import { describe, expect, it } from "@jest/globals";
import { CALLER, meshRequest, signedDlqHeaders } from "./helpers";

const DLQ = "https://dlq-service:3000";

describe("DLQ E2E", () => {
	it("reports MongoDB ready", () => {
		expect(meshRequest(CALLER.scraper, `${DLQ}/health/ready`).status).toBe(200);
	});

	it("lists the entries for a signed caller", () => {
		const { status } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			headers: signedDlqHeaders(undefined, "GET", "/dlq"),
		});
		expect(status).toBe(200);
	});

	it("no longer takes dead letters: they go to the dead streams (ADR-0073)", () => {
		const entry = { topic: "e2e.test.topic", message: {} };
		const { status } = meshRequest(CALLER.message, `${DLQ}/dlq`, {
			method: "POST",
			body: entry,
			headers: signedDlqHeaders(entry, "POST", "/dlq"),
		});
		expect(status).toBe(404);
	});
});
