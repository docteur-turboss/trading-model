import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "@jest/globals";
import { getKeepAliveAgent } from "../../src/http-utils";

const SERVER_KEEP_ALIVE_MS = 2000;
const AGENT_TIMEOUT_MS = 50;

function request(
	agent: http.Agent,
	port: number,
	method: string
): Promise<number | undefined> {
	return new Promise((resolve, reject) => {
		const req = http.request({ agent, port, method }, (res) => {
			res.resume();
			res.on("end", () => resolve(res.statusCode));
		});
		req.on("error", reject);
		req.end(method === "POST" ? "{}" : undefined);
	});
}

// Same options as the shared agent over plain http (the shared one is https-only).
async function freeSocketsAfterIdle(timeout: number | undefined) {
	const server = http.createServer((_req, res) => res.end("ok"));
	server.keepAliveTimeout = SERVER_KEEP_ALIVE_MS;
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	const { options } = getKeepAliveAgent();
	const agent = new http.Agent({
		...options,
		protocol: "http:",
		defaultPort: 80,
		timeout,
	});
	try {
		await request(agent, port, "GET");
		await new Promise((r) => setTimeout(r, AGENT_TIMEOUT_MS * 4));
		const free = Object.values(agent.freeSockets).flat().length;
		const status = await request(agent, port, "POST");
		return { free, status };
	} finally {
		agent.destroy();
		server.closeAllConnections();
		await new Promise((r) => server.close(r));
	}
}

describe("shared keep-alive agent", () => {
	it("is configured below the server's 5 s keepAliveTimeout", () => {
		expect(getKeepAliveAgent().options.timeout).toBeLessThan(5000);
	});

	it("drops idle sockets itself, so a later POST opens a fresh connection", async () => {
		const { free, status } = await freeSocketsAfterIdle(AGENT_TIMEOUT_MS);
		expect(free).toBe(0);
		expect(status).toBe(200);
	});

	it("control: without timeout the idle socket stays pooled", async () => {
		const { free } = await freeSocketsAfterIdle(undefined);
		expect(free).toBe(1);
	});
});
