import { describe, expect, it, jest } from "@jest/globals";
import { createHandlers } from "../../src/adapters/inbound/handlers";
import type { RiskExecution } from "../../src/application/risk-execution";

const as = (service: string) =>
	({
		clientIdentity: `spiffe://trading-model.local/ns/trading-model/sa/${service}`,
	}) as never;
/** Through the gateway: its SVID and the API key name in x-actor. */
const viaGateway = (actor?: string) =>
	({
		...(as("api-gateway") as object),
		headers: actor ? { "x-actor": actor } : {},
	}) as never;
const input = (body?: unknown, params?: unknown) =>
	({ body, params, query: undefined }) as never;

function build() {
	const risk = {
		submitIntent: jest.fn<(...args: any[]) => any>(async () => ({
			status: "rejected",
			reason: "kill_switch",
			clientOrderId: "rx-1",
		})),
		observePrice: jest.fn<(...args: any[]) => any>(async () => undefined),
		cancel: jest.fn<(...args: any[]) => any>(async (id: string) =>
			id === "none" ? "not_found" : "cancelled"
		),
		status: jest.fn<(...args: any[]) => any>(() => ({
			mode: "paper",
			ready: true,
		})),
		engage: jest.fn<(...args: any[]) => any>(async () => undefined),
		rearm: jest.fn<(...args: any[]) => any>(async () => undefined),
	};
	const metrics = jest.fn<(outcome: string) => void>();
	return {
		risk,
		metrics,
		h: createHandlers(risk as unknown as RiskExecution, metrics, [
			"decision-consumer",
		]),
	};
}

describe("risk-execution routes: each caller only reaches its own routes (ADR-0064 §1)", () => {
	it("intents and prices: the decision consumer only", async () => {
		const { h, risk, metrics } = build();
		const body = { decisionId: "d" };
		expect((await h.intent(input(body), as("api-gateway"))).status).toBe(403);
		expect((await h.intent(input(body), as("risk-execution"))).status).toBe(
			403
		);
		expect(
			(
				await h.price(
					input({ symbol: "BTCUSDT", price: 1, at: 1 }),
					as("model-evaluator")
				)
			).status
		).toBe(403);
		expect(risk.submitIntent).not.toHaveBeenCalled();
		expect((await h.intent(input(body), as("decision-consumer"))).status).toBe(
			200
		);
		expect(metrics).toHaveBeenCalledWith("rejected:kill_switch");
		expect(
			(
				await h.price(
					input({ symbol: "BTCUSDT", price: 1, at: 1 }),
					as("decision-consumer")
				)
			).status
		).toBe(200);
		expect(risk.observePrice).toHaveBeenCalledWith("BTCUSDT", 1, 1);
	});

	it("a request without a SPIFFE identity is refused", async () => {
		const { h } = build();
		expect((await h.intent(input({}), {} as never)).status).toBe(403);
	});

	it("no decision consumer exists yet: by default nobody sends intents or prices", async () => {
		const { risk } = build();
		const h = createHandlers(risk as unknown as RiskExecution, () => undefined);
		expect((await h.intent(input({}), as("trader-trainer"))).status).toBe(403);
		expect((await h.price(input({}), as("trader-trainer"))).status).toBe(403);
		expect(risk.submitIntent).not.toHaveBeenCalled();
	});

	it("admin routes: the service's own identity only, the consumer cannot read, engage or re-arm", async () => {
		const { h, risk } = build();
		const engage = { scope: "global" as const, reason: "x" };
		expect((await h.adminStatus(input(), as("decision-consumer"))).status).toBe(
			403
		);
		expect(
			(await h.adminEngage(input(engage), as("decision-consumer"))).status
		).toBe(403);
		expect(
			(await h.adminRearm(input(engage), as("decision-consumer"))).status
		).toBe(403);
		expect(risk.engage).not.toHaveBeenCalled();
		expect((await h.adminStatus(input(), as("risk-execution"))).status).toBe(
			200
		);
		expect(
			(await h.adminEngage(input(engage), as("risk-execution"))).status
		).toBe(403);
		expect((await h.adminEngage(input(engage), viaGateway())).status).toBe(403);
		expect(
			(await h.adminEngage(input(engage), viaGateway("alice"))).status
		).toBe(200);
		expect(risk.engage).toHaveBeenCalledWith("global", "x", "alice", undefined);
	});

	it("a symbol scope needs a symbol, and a refused re-arming is a 403", async () => {
		const { h, risk } = build();
		const noSymbol = { scope: "symbol" as const, reason: "x" };
		expect(
			(await h.adminEngage(input(noSymbol), viaGateway("op"))).status
		).toBe(400);
		expect((await h.adminRearm(input(noSymbol), viaGateway("op"))).status).toBe(
			400
		);
		risk.rearm.mockRejectedValueOnce(
			new Error("Only the owner re-arms after the drawdown stop")
		);
		const refused = await h.adminRearm(
			input({ ...noSymbol, scope: "global" }),
			viaGateway("op")
		);
		expect(refused.status).toBe(403);
		expect(
			(
				await h.adminRearm(
					input({ ...noSymbol, scope: "global" }),
					viaGateway("owner")
				)
			).status
		).toBe(200);
	});

	it("cancel: the consumer or the operator, 404 for an unknown order", async () => {
		const { h } = build();
		expect(
			(
				await h.cancel(
					input(undefined, { clientOrderId: "rx-1" }),
					as("api-gateway")
				)
			).status
		).toBe(403);
		expect(
			(
				await h.cancel(
					input(undefined, { clientOrderId: "rx-1" }),
					as("decision-consumer")
				)
			).status
		).toBe(200);
		expect(
			(
				await h.cancel(
					input(undefined, { clientOrderId: "none" }),
					as("risk-execution")
				)
			).status
		).toBe(404);
	});
});
