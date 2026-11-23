import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mountRoute } from "@trading-model/http/api-route/mount-route";
import { ResponseProtocol } from "@trading-model/http/response-protocol";
import express, { Router } from "express";
import { RiskClient } from "../../services/decision-consumer/src/adapters/outbound/risk-client";
import { RISK_API } from "../../services/risk-execution/src/adapters/inbound/api-routes";
import { createHandlers } from "../../services/risk-execution/src/adapters/inbound/handlers";
import { PaperBroker } from "../../services/risk-execution/src/adapters/outbound/paper-broker";
import { RiskExecution } from "../../services/risk-execution/src/application/risk-execution";
import { RiskLimits } from "../../services/risk-execution/src/domain/limits";
import { newState } from "../../services/risk-execution/src/domain/state";

/**
 * Intent contract: decision-consumer's `RiskClient` → risk-execution's
 * `POST /intents` (ADR-0087). Real client, real route, real handlers and
 * service; only the mTLS transport (the caller identity is a header) and the
 * stores and market feed are replaced.
 */

jest.mock(
	"../../services/decision-consumer/src/config/address-manager",
	() => ({
		FIND_A_SERVICE: async () => ({ host: "risk", port: 3000 }),
	})
);
jest.mock("@trading-model/primitives/service-identity", () => ({
	HostPort: { toAddress: () => "risk:3000" },
}));

let baseUrl = "";
const post = (caller: string, body: unknown) =>
	fetch(`${baseUrl}/intents`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-caller": caller },
		body: JSON.stringify(body),
	});
const read = (caller: string, symbol: string) =>
	fetch(`${baseUrl}/positions/${symbol}`, { headers: { "x-caller": caller } });
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: {
		createWithTls: () => ({
			get: async (url: string, _o: unknown, schema: any) => {
				const res = await read("decision-consumer", url.split("/").pop() ?? "");
				if (!res.ok) {
					throw new Error(`${res.status}`);
				}
				return schema.parse(await res.json());
			},
			post: async (_url: string, body: unknown, _o: unknown, schema: any) => {
				const res = await post("decision-consumer", body);
				if (!res.ok) {
					throw new Error(`${res.status}`);
				}
				return schema.parse(await res.json());
			},
		}),
	},
}));

class Memory<T> {
	value: T | null = null;
	async load() {
		return this.value;
	}
	async save(state: T) {
		this.value = JSON.parse(JSON.stringify(state)) as T;
	}
}

const NOW = Date.now();
const LIMITS = RiskLimits.parse({
	allocatedCapital: 100_000,
	instruments: { BTCUSDT: { maxQuantity: 0.1 } },
});
const INTENT = {
	decisionId: "BTCUSDT@v1:1",
	symbol: "BTCUSDT",
	side: "buy" as const,
	quantity: 0.01,
	referencePrice: 60_000,
	referenceAt: NOW,
	model: { symbol: "BTCUSDT", version: "v1" },
};

describe("intent contract: decision-consumer → risk-execution", () => {
	let server: Server;

	beforeAll(async () => {
		const store = new Memory<never>();
		store.value = newState(LIMITS.allocatedCapital, NOW) as never;
		const risk = new RiskExecution({
			limits: LIMITS,
			broker: new PaperBroker(new Memory<never>(), 100_000),
			store,
			admission: { isAdmissible: async () => true },
			prices: {
				latest: async () => ({ BTCUSDT: { price: 60_000, at: NOW } }),
			},
			mode: "paper",
			ownerActor: "owner",
			emit: () => undefined,
		});
		await risk.start();
		const handlers = createHandlers(risk, () => undefined, [
			"decision-consumer",
		]);
		const router = Router();
		mountRoute(router, RISK_API.intent, handlers.intent);
		mountRoute(router, RISK_API.position, handlers.position);
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as unknown as { clientIdentity: string }).clientIdentity =
				`spiffe://trading-model.local/ns/trading-model/sa/${req.header("x-caller")}`;
			next();
		});
		app.use(router);
		app.use(ResponseProtocol);
		await new Promise<void>((resolve) => {
			server = app.listen(0, "127.0.0.1", resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	it("accepts the intent of the consumer, and the same decision twice makes one order", async () => {
		const client = new RiskClient({} as never);
		const first = await client.send(INTENT);
		const again = await client.send(INTENT);
		expect(first.status).not.toBe("rejected");
		expect(again.clientOrderId).toBe(first.clientOrderId);
	});

	it("reads the real position: the fill of the intent, 0 when flat, 403 for any other identity", async () => {
		const client = new RiskClient({} as never);
		expect(await client.position("BTCUSDT")).toBeCloseTo(INTENT.quantity);
		expect(await client.position("ETHUSDT")).toBe(0);
		for (const caller of ["api-gateway", "model-evaluator", "risk-execution"]) {
			expect((await read(caller, "BTCUSDT")).status).toBe(403);
		}
	});

	it("answers a rejection as a result with its reason code", async () => {
		const result = await new RiskClient({} as never).send({
			...INTENT,
			decisionId: "BTCUSDT@v1:2",
			quantity: 5,
		});
		expect(result.status).toBe("rejected");
		expect(result.reason).toEqual(expect.any(String));
	});

	it("refuses any other identity with a 403", async () => {
		for (const caller of ["api-gateway", "model-evaluator", "risk-execution"]) {
			expect((await post(caller, INTENT)).status).toBe(403);
		}
	});
});
