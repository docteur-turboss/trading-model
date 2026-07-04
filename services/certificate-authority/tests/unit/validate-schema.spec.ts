import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";

import { validateSchema } from "../../src/middleware/validate-schema";

describe("validateSchema", () => {
	function mockRes() {
		const json = jest.fn();
		const status = jest.fn(() => ({ json }));
		return { status, json } as any;
	}

	it("should call next when validation passes", () => {
		const schema = z.object({ name: z.string() });
		const middleware = validateSchema(schema);
		const req = { body: { name: "test" } } as any;
		const res = mockRes();
		const next = jest.fn();

		middleware(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(req.body).toEqual({ name: "test" });
	});

	it("should return 400 when validation fails", () => {
		const schema = z.object({ name: z.string().min(1) });
		const middleware = validateSchema(schema);
		const req = { body: { name: "" } } as any;
		const res = mockRes();
		const next = jest.fn();

		middleware(req, res, next);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.status().json).toHaveBeenCalledWith({
			error: "Validation failed",
			details: expect.any(Array),
		});
		expect(next).not.toHaveBeenCalled();
	});

	it("should return validation details with field paths", () => {
		const schema = z.object({ nested: z.object({ value: z.number() }) });
		const middleware = validateSchema(schema);
		const req = { body: { nested: { value: "not-a-number" } } } as any;
		const res = mockRes();
		const next = jest.fn();

		middleware(req, res, next);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.status().json).toHaveBeenCalledWith({
			error: "Validation failed",
			details: expect.arrayContaining([
				expect.objectContaining({
					field: "nested.value",
					message: expect.any(String),
				}),
			]),
		});
	});

	it("should overwrite req.body with parsed data", () => {
		const schema = z.object({ age: z.coerce.number() });
		const middleware = validateSchema(schema);
		const req = { body: { age: "42" } } as any;
		const res = mockRes();
		const next = jest.fn();

		middleware(req, res, next);

		expect(req.body).toEqual({ age: 42 });
		expect(next).toHaveBeenCalled();
	});
});
