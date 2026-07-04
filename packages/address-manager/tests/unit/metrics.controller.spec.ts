import { describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { metricsController } from "../../src/http/metrics.controller";

describe("metricsController", () => {
	function mockReqRes(snapshot?: () => Record<string, unknown>) {
		const json = jest.fn();
		const status = jest.fn(() => ({ json }));
		const req = {
			app: {
				locals: {
					metricsSnapshot: snapshot,
				},
			},
		} as unknown as Request;
		const res = { status, json } as unknown as Response;
		return { req, res, status, json };
	}

	it("should return metrics data from snapshot function", () => {
		const { req, res } = mockReqRes(() => ({ cpu: 0.5, mem: 1024 }));
		metricsController(req, res);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("should return empty object when no snapshot function", () => {
		const { req, res } = mockReqRes(undefined);
		metricsController(req, res);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});
