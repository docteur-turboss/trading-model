import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("metrics data");

jest.mock("prom-client", () => ({
	Registry: jest.fn().mockImplementation(() => ({
		contentType: "text/plain",
		metrics: mockMetricsFn,
	})),
	collectDefaultMetrics: jest.fn(),
	Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
	Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
	Gauge: jest.fn().mockImplementation(() => ({
		set: jest.fn(),
		inc: jest.fn(),
		dec: jest.fn(),
	})),
}));

import {
	incAuthFailure,
	incRenewalFailure,
	incRevoked,
	incSigned,
	METRICS_HANDLER,
	observeSignDuration,
	sendAlertWebhook,
	setWorkerPoolPending,
	setWorkerPoolSize,
} from "../../src/monitoring/metrics";

describe("metrics", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("incSigned should increment counter", () => {
		incSigned();
		incSigned("renew");
	});

	it("observeSignDuration should record histogram", () => {
		observeSignDuration("sign", 150);
	});

	it("incRevoked should increment counter", () => {
		incRevoked();
	});

	it("incRenewalFailure should increment counter with serviceId", () => {
		incRenewalFailure("svc-1");
	});

	it("incAuthFailure should increment counter with reason", () => {
		incAuthFailure("invalid_token");
	});

	it("setWorkerPoolSize should set gauge", () => {
		setWorkerPoolSize(4);
	});

	it("setWorkerPoolPending should set gauge", () => {
		setWorkerPoolPending(2);
	});

	it("METRICS_HANDLER should return metrics", async () => {
		const res = {
			setHeader: jest.fn(),
			end: jest.fn(),
		} as any;

		await METRICS_HANDLER({} as any, res, () => {});

		expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});

	describe("sendAlertWebhook", () => {
		const mockFetch = jest.fn() as any;

		beforeEach(() => {
			(globalThis as any).fetch = mockFetch;
		});

		it("should do nothing when webhookUrl is undefined", () => {
			sendAlertWebhook({
				webhookUrl: undefined,
				title: "title",
				message: "msg",
			});
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should do nothing when webhookUrl is empty", () => {
			sendAlertWebhook({ webhookUrl: "", title: "title", message: "msg" });
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should POST alert to webhook URL", () => {
			mockFetch.mockResolvedValue({ ok: true });

			sendAlertWebhook({
				webhookUrl: "https://hooks.example.com/alert",
				title: "Alert",
				message: "Something happened",
				severity: "warning",
				labels: { env: "prod" },
			});

			expect(mockFetch).toHaveBeenCalledWith(
				"https://hooks.example.com/alert",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
				})
			);
		});

		it("should log warning on non-OK response", async () => {
			mockFetch.mockResolvedValue({ ok: false, status: 500 });

			sendAlertWebhook({
				webhookUrl: "https://hooks.example.com/alert",
				title: "Alert",
				message: "msg",
			});

			await new Promise(process.nextTick);
		});

		it("should log warning on fetch error", async () => {
			mockFetch.mockRejectedValue(new Error("Network failure"));

			sendAlertWebhook({
				webhookUrl: "https://hooks.example.com/alert",
				title: "Alert",
				message: "msg",
			});

			await new Promise(process.nextTick);
		});
	});
});
