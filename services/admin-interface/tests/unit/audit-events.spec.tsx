import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEvents } from "../../src/pages/audit-events";

const AUDIT_DOCS = [
	{
		timestamp: "t1",
		topic: "AUTH",
		publisher: "p1",
		correlationId: "cid1",
		summary: "Login",
		severity: "INFO",
	},
	{
		timestamp: "t2",
		topic: "ORDER",
		publisher: "p2",
		correlationId: "cid2",
		summary: "Order placed",
		severity: "ERROR",
	},
];

describe("AuditEvents", () => {
	beforeEach(() => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					docs: AUDIT_DOCS,
					total: 2,
					page: 0,
					limit: 5,
					volumeByTopic: [{ topic: "AUTH", count: 100 }],
				}),
		});
	});

	it("should render audit rows with severity badges", async () => {
		render(<AuditEvents />);

		expect(await screen.findByText("Login")).toBeInTheDocument();
		expect(screen.getByText("Order placed")).toBeInTheDocument();
		expect(screen.getByText("AUTH")).toBeInTheDocument();
		expect(screen.getByText("cid1")).toBeInTheDocument();
	});

	it("should render severity badges for each event", async () => {
		render(<AuditEvents />);

		expect(await screen.findByText("Login")).toBeInTheDocument();
		expect(screen.getAllByText("INFO").length).toBeGreaterThan(0);
		expect(screen.getAllByText("ERROR").length).toBeGreaterThan(0);
	});

	it("should render the volume by topic chart", async () => {
		render(<AuditEvents />);

		expect(await screen.findByText("Volume by Topic")).toBeInTheDocument();
	});
});
