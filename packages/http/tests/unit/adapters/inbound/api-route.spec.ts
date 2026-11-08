import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	binary,
	brand,
	defineRoute,
	ErrorResponse,
	parseRequest,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception/send-response";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";

const listEntries = defineRoute({
	method: "GET",
	path: "/entries/:topic",
	summary: "List the entries of a topic",
	params: z.object({ topic: z.string().min(1) }),
	query: z.object({
		limit: z.coerce.number().int().min(1).max(100).default(10),
	}),
	responses: {
		200: z.object({
			topic: z.string(),
			limit: z.number().int(),
			at: z.iso.datetime(),
		}),
		400: ErrorResponse,
	},
});

const download = defineRoute({
	method: "GET",
	path: "/files/:name",
	summary: "Download a file",
	responses: { 200: binary("application/octet-stream"), 404: ErrorResponse },
});

const addEntry = defineRoute({
	method: "POST",
	path: "/entries",
	summary: "Add an entry",
	body: z.object({ name: z.string() }),
	responses: { 201: null, 400: ErrorResponse },
});

describe("brand", () => {
	const Even = {
		of(value: number) {
			if (value % 2 !== 0) {
				throw new RangeError(`Even expected, got ${value}`);
			}
			return value as number & { readonly brand: "Even" };
		},
	};
	const schema = z.object({ n: z.number().transform(brand(Even.of)) });

	it("applies the brand", () => {
		expect(schema.parse({ n: 2 })).toEqual({ n: 2 });
	});

	it("turns a rejected value into a validation issue instead of throwing", () => {
		const result = schema.safeParse({ n: 3 });

		expect(result.success).toBe(false);
		expect(result.error?.issues).toEqual([
			expect.objectContaining({ path: ["n"], message: "Even expected, got 3" }),
		]);
	});

	it("reports a non-Error rejection", () => {
		const throwsString = z.string().transform(
			brand(() => {
				// biome-ignore lint/style/useThrowOnlyError: brand must survive a library that throws a string
				throw "nope";
			})
		);

		expect(throwsString.safeParse("x").error?.issues[0].message).toBe("nope");
	});
});

describe("parseRequest", () => {
	it("returns the parsed values, defaults and coercions applied", () => {
		const parsed = parseRequest(listEntries, {
			params: { topic: "t" },
			query: { limit: "5" },
		});

		expect(parsed).toEqual({
			success: true,
			input: { params: { topic: "t" }, query: { limit: 5 }, body: undefined },
		});
	});

	it("reports every failing field, prefixed with its part", () => {
		const parsed = parseRequest(listEntries, {
			params: { topic: "" },
			query: { limit: "500" },
		});

		expect(parsed.success).toBe(false);
		expect(!parsed.success && parsed.error).toEqual({
			error: "Validation failed",
			details: [
				{ field: "params.topic", message: expect.any(String) },
				{ field: "query.limit", message: expect.any(String) },
			],
		});
		expect(
			ErrorResponse.safeParse(!parsed.success && parsed.error).success
		).toBe(true);
	});

	it("validates a missing part as empty", () => {
		expect(parseRequest(addEntry, {}).success).toBe(false);
	});
});

describe("responseIssues", () => {
	it("accepts a body that matches after the JSON round trip", () => {
		const data = { topic: "t", limit: 5, at: new Date("2026-10-28T00:00:00Z") };

		expect(responseIssues(listEntries, 200, data)).toEqual([]);
	});

	it("accepts a body already serialized", () => {
		const data = JSON.stringify({
			topic: "t",
			limit: 5,
			at: "2026-10-28T00:00:00Z",
		});

		expect(responseIssues(listEntries, 200, data)).toEqual([]);
	});

	it("names the field that does not match", () => {
		expect(
			responseIssues(listEntries, 200, { topic: "t", limit: "5", at: "x" })
		).toEqual([
			expect.stringMatching(/^GET \/entries\/:topic → 200: limit: /),
			expect.stringMatching(/^GET \/entries\/:topic → 200: at: /),
		]);
	});

	it("names the fields the schema does not declare, nested ones included", () => {
		const data = {
			topic: "t",
			limit: 5,
			at: "2026-10-28T00:00:00Z",
			_id: "abc",
		};

		expect(responseIssues(listEntries, 200, data)).toEqual([
			"GET /entries/:topic → 200: _id: not in the response schema",
		]);
		const nested = defineRoute({
			method: "GET",
			path: "/n",
			summary: "s",
			responses: { 200: z.array(z.object({ a: z.object({ b: z.number() }) })) },
		});
		expect(responseIssues(nested, 200, [{ a: { b: 1, c: 2 } }])).toEqual([
			"GET /n → 200: 0.a.c: not in the response schema",
		]);
	});

	it("rejects an undeclared status", () => {
		expect(responseIssues(listEntries, 404, {})).toEqual([
			"GET /entries/:topic → 404: status not declared in the route's responses",
		]);
	});

	it("checks a binary response", () => {
		expect(responseIssues(download, 200, new Uint8Array([1, 2]))).toEqual([]);
		expect(responseIssues(download, 200, new ArrayBuffer(2))).toEqual([]);
		expect(responseIssues(download, 200, { not: "bytes" })).toEqual([
			"GET /files/:name → 200: expected application/octet-stream bytes",
		]);
	});

	it("checks a response declared without body", () => {
		expect(responseIssues(addEntry, 201, undefined)).toEqual([]);
		expect(responseIssues(addEntry, 201, { id: 1 })).toEqual([
			"POST /entries → 201: declared without body, got one",
		]);
	});
});

describe("mountRoute", () => {
	let baseUrl: string;
	let server: ReturnType<ReturnType<typeof express>["listen"]>;
	const calls: string[] = [];

	beforeAll(async () => {
		const router = express.Router();
		mountRoute(router, listEntries, ({ params, query }) =>
			sendResponse(
				{ topic: params.topic, limit: query.limit, at: new Date(0) },
				200 as HttpStatusCode
			)
		);
		mountRoute(router, download, () => ({
			status: 200 as HttpStatusCode,
			data: Buffer.from([0, 1, 255]),
			contentType: "application/octet-stream",
			headers: { "x-checksum": "abc" },
		}));
		mountRoute(
			router,
			addEntry,
			({ body }) => {
				if (body.name === "boom") {
					throw new Error("handler failure");
				}
				return sendResponse(undefined, 201 as HttpStatusCode);
			},
			{
				middlewares: [
					(_req, _res, next) => {
						calls.push("middleware");
						next();
					},
				],
			}
		);
		const app = express();
		app.use(express.json());
		app.use(router);
		app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
			res.status(500).json({ error: err.message });
		});
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	it("serves the parsed input to the handler", async () => {
		const res = await fetch(`${baseUrl}/entries/market?limit=3`);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			topic: "market",
			limit: 3,
			at: "1970-01-01T00:00:00.000Z",
		});
		expect(responseIssues(listEntries, res.status, body)).toEqual([]);
	});

	it("answers 400 with an ErrorResponse before calling the handler", async () => {
		const res = await fetch(`${baseUrl}/entries/market?limit=0`);

		expect(res.status).toBe(400);
		expect(responseIssues(listEntries, res.status, await res.json())).toEqual(
			[]
		);
	});

	it("runs the middlewares first, and mounts the entry's method", async () => {
		const res = await fetch(`${baseUrl}/entries`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "a" }),
		});

		expect(res.status).toBe(201);
		expect(calls).toEqual(["middleware"]);
		expect((await fetch(`${baseUrl}/entries`)).status).toBe(404);
	});

	it("sends a binary body with its media type and headers", async () => {
		const res = await fetch(`${baseUrl}/files/a.bin`);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/octet-stream");
		expect(res.headers.get("x-checksum")).toBe("abc");
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect([...bytes]).toEqual([0, 1, 255]);
		expect(responseIssues(download, res.status, bytes)).toEqual([]);
	});

	it("passes a handler error to the Express error handler", async () => {
		const res = await fetch(`${baseUrl}/entries`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "boom" }),
		});

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "handler failure" });
	});
});
