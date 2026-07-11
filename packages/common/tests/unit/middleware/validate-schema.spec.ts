import { describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { validateSchema } from "../../../src/middleware/validate-schema";

describe("validateSchema", () => {
	const schema = z.object({
		name: z.string(),
		age: z.number(),
	});

	it("should pass valid data", () => {
		const middleware = validateSchema(schema);
		const req = { body: { name: "John", age: 30 } } as Request;
		const res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
		} as unknown as Response;
		const next = jest.fn() as NextFunction;

		middleware(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(req.body).toEqual({ name: "John", age: 30 });
	});

	it("should reject invalid data with 400", () => {
		const middleware = validateSchema(schema);
		const req = { body: { name: "John" } } as Request;
		const res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
		} as unknown as Response;
		const next = jest.fn() as NextFunction;

		middleware(req, res, next);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Validation failed" })
		);
		expect(next).not.toHaveBeenCalled();
	});
});
