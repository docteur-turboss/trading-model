import { describe, expect, it } from "@jest/globals";
import promClient from "prom-client";
import "../../src/config/metrics";

describe("dlq_audit_publish_failures_total", () => {
	it("exposes every DLQ event at 0 before any failure, so DlqAuditEventLost sees the first loss", async () => {
		const text = await promClient.register.metrics();
		for (const event of [
			"dlq.entries.deleted",
			"dlq.replay.completed",
			"dlq.entry.added",
		]) {
			expect(text).toContain(
				`dlq_audit_publish_failures_total{event="${event}"} 0`
			);
		}
	});
});
