import { describe, expect, it } from "vitest";
import { createAuditColumns } from "../../src/pages/helpers/audit-utils";

describe("createAuditColumns", () => {
	it("should return the six audit columns in order", () => {
		const columns = createAuditColumns();

		expect(columns.map((col) => col.id)).toEqual([
			"timestamp",
			"topic",
			"publisher",
			"cid",
			"summary",
			"severity",
		]);
		expect(columns.map((col) => col.label)).toEqual([
			"Timestamp",
			"Topic",
			"Publisher",
			"Correlation ID",
			"Summary",
			"Severity",
		]);
	});

	it("should render each column value from a row", () => {
		const columns = createAuditColumns();
		const row = {
			timestamp: "2024-05-20T14:30:00.000Z",
			topic: "AUTH",
			publisher: "auth-service",
			correlationId: "cid-1",
			summary: "User login",
			severity: "ERROR",
		};

		const rendered = columns.map((col) =>
			(col.render as (row: typeof row) => unknown)(row)
		);

		expect(rendered).toEqual([
			row.timestamp,
			row.topic,
			row.publisher,
			row.correlationId,
			row.summary,
			row.severity,
		]);
	});
});
