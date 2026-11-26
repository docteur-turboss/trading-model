import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mountRoute } from "@trading-model/http/api-route/mount-route";
import { ResponseProtocol } from "@trading-model/http/response-protocol";
import { AGENT_STATE_DIM } from "@trading-model/model-runtime/agent/agent-state";
import { FEATURE_DIM } from "@trading-model/model-runtime/feature-vector-codec";
import { decideOnLastBar } from "@trading-model/model-runtime/replay";
import express, { Router } from "express";
import { RiskClient } from "../../services/decision-consumer/src/adapters/outbound/risk-client";
import { createDecisionTick } from "../../services/decision-consumer/src/application/decide";
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
// The model's forward pass is not the contract: the decision is given.
jest.mock("@trading-model/model-runtime/replay", () => ({
	decideOnLastBar: jest.fn(),
}));
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

// 01:45 UTC: the daily bar of the day before is in (collected at 01:30).
const NOW = Date.UTC(2026, 10, 26, 1, 45);
const DAY_MS = 86_400_000;
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
			admission: { admission: async () => ({ admissible: true }) },
			prices: {
				latest: async () => ({ BTCUSDT: { price: 60_000, at: NOW } }),
			},
			mode: "paper",
			ownerActor: "owner",
			emit: () => undefined,
			now: () => NOW,
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

	it("accepts the intent of a daily model at 01:45 UTC for the bar of the day before", async () => {
		const bar = Date.UTC(2026, 10, 25);
		jest.mocked(decideOnLastBar).mockReturnValue({
			barTimestamp: bar,
			price: 60_000,
			// A sale: a buy would fall in the duplicate window of the first test (frozen clock).
			order: { side: "sell", quantity: 0.01 },
		});
		const weights = new Uint8Array(8);
		const sha256 = createHash("sha256").update(weights).digest("hex");
		const results: { status: string }[] = [];
		const client = new RiskClient({} as never);
		const tick = createDecisionTick({
			promoted: [INTENT.model],
			trainer: {
				manifest: async () =>
					({
						...INTENT.model,
						weights: { sha256, length: 2 },
						genome: {
							network: { inputDim: FEATURE_DIM + AGENT_STATE_DIM },
							rl: { horizon: {} },
						},
						admission: { admissible: true },
						replay: {
							intervalMs: DAY_MS,
							simulator: { initialCash: 1_000_000 },
						},
					}) as never,
				weights: async () => ({ bytes: weights, sha256 }),
			},
			scraper: { candles: async () => [] },
			risk: {
				position: (symbol) => client.position(symbol),
				send: async (intent) => {
					const result = await client.send(intent);
					results.push(result);
					return result;
				},
			},
			audit: { promotionLoaded: async () => undefined },
			windowBars: 50,
			now: () => NOW,
		});
		await tick();
		expect(results).toHaveLength(1);
		expect(results[0].status).not.toBe("rejected");
	});

	it("refuses any other identity with a 403", async () => {
		for (const caller of ["api-gateway", "model-evaluator", "risk-execution"]) {
			expect((await post(caller, INTENT)).status).toBe(403);
		}
	});
});
