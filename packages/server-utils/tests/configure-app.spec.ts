import http from "node:http";
import { configureApp } from "../src/adapters/inbound/configure-app";

function makeRequest(
	app: http.RequestListener,
	method: string,
	path: string
): Promise<{
	statusCode: number;
	body: string;
	headers: http.IncomingHttpHeaders;
}> {
	return new Promise((resolve, reject) => {
		const server = http.createServer(app);
		server.listen(0, () => {
			const addr = server.address() as { port: number };
			const req = http.request(
				{
					method,
					hostname: "localhost",
					port: addr.port,
					path,
				},
				(res) => {
					let data = "";
					res.on("data", (chunk: string) => {
						data += chunk;
					});
					res.on("end", () => {
						server.close();
						resolve({
							statusCode: res.statusCode ?? 0,
							body: data,
							headers: res.headers,
						});
					});
				}
			);
			req.on("error", (err) => {
				server.close();
				reject(err);
			});
			req.end();
		});
	});
}

describe("configureApp", () => {
	it("should return an Express Application", () => {
		const app = configureApp();

		expect(app).toBeDefined();
		expect(typeof app.use).toBe("function");
		expect(typeof app.get).toBe("function");
	});

	it("should respond to the ping route", async () => {
		const app = configureApp();

		const response = await makeRequest(app as never, "GET", "/ping");

		expect(response.statusCode).toBe(200);
		expect(JSON.parse(response.body)).toEqual({ status: "ok" });
	});

	it("should return 404 for unknown routes", async () => {
		const app = configureApp();

		const response = await makeRequest(app as never, "GET", "/unknown");

		expect(response.statusCode).toBe(404);
	});

	it("should return 429 when rate limited", async () => {
		const app = configureApp({
			rateLimit: {
				windowMs: 60000 as never,
				limit: 1 as never,
			},
		});

		const response1 = await makeRequest(app as never, "GET", "/ping");
		expect(response1.statusCode).toBe(200);

		const response2 = await makeRequest(app as never, "GET", "/ping");
		expect(response2.statusCode).toBe(429);
	});

	it("should set trust proxy when enabled", () => {
		const app = configureApp({ trustProxy: true });

		expect(app.get("trust proxy")).toBe("loopback");
	});

	it("should not set trust proxy when disabled", () => {
		const app = configureApp();

		expect(app.get("trust proxy")).toBeFalsy();
	});
});
