/**
 * Drill of docs/compliance/risk-limits-policy.md §7 (ADR-0064 §5): the seven
 * steps of the scenario against the real service class, the file-backed state
 * and the simulated broker ledger (a restart rebuilds everything from disk).
 * Its timings are the ones written in docs/compliance/risk-drill-log.md.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Intent } from "@trading-model/contracts/order-intent";
import { RISK_API } from "../../src/adapters/inbound/api-routes";
import { createHandlers } from "../../src/adapters/inbound/handlers";
import { JsonFile } from "../../src/adapters/outbound/json-file";
import { PaperBroker } from "../../src/adapters/outbound/paper-broker";
import { RiskExecution } from "../../src/application/risk-execution";
import { RiskLimits } from "../../src/domain/limits";
import type { BrokerPort } from "../../src/domain/ports";
import type { RiskState } from "../../src/domain/state";
import { RestingBroker } from "../resting-broker";

const LIMITS = RiskLimits.parse({
	allocatedCapital: 100_000,
	instruments: { BTCUSDT: { maxQuantity: 0.1 }, ETHUSDT: { maxQuantity: 5 } },
});
const PRICE = { BTCUSDT: 60_000, ETHUSDT: 3_000 } as const;
/** The market the service reads: `PRICE` unless a step moves it, observed now unless the feed stops. */
let market: Record<string, number> = { ...PRICE };
let feedStoppedAt: number | null = null;
let dir: string;
let clock = Date.parse("2026-11-20T10:00:00Z");
let seq = 0;
const timings: Record<string, number> = {};

const intent = (
	symbol: "BTCUSDT" | "ETHUSDT",
	over: Partial<Intent> = {}
): Intent => ({
	decisionId: `drill-${++seq}`,
	symbol,
	side: "buy",
	quantity: symbol === "BTCUSDT" ? 0.01 : 0.2,
	referencePrice: PRICE[symbol],
	referenceAt: clock,
	model: { symbol, version: "v1" },
	allowRepeat: true,
	...over,
});

function boot(broker?: BrokerPort) {
	const ledger = new RestingBroker(
		new PaperBroker(
			new JsonFile(join(dir, "ledger.json")),
			LIMITS.allocatedCapital
		)
	);
	const svc = new RiskExecution({
		limits: LIMITS,
		broker: broker ?? ledger,
		store: new JsonFile<RiskState>(join(dir, "state.json")),
		admission: { admission: async () => ({ admissible: true }) },
		prices: {
			latest: async (symbols) =>
				Object.fromEntries(
					symbols.map((sym) => [
						sym,
						{ price: market[sym], at: feedStoppedAt ?? clock },
					])
				),
		},
		mode: "paper",
		ownerActor: "owner",
		now: () => clock,
	});
	return { svc, ledger };
}

const asCaller = (service: string) =>
	({
		clientIdentity: `spiffe://trading-model.local/ns/trading-model/sa/${service}`,
	}) as never;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "risk-drill-"));
});
afterAll(async () => {
	console.info(`risk-execution drill timings (ms): ${JSON.stringify(timings)}`);
	await rm(dir, { recursive: true, force: true });
});

describe("kill switch drill (policy §7)", () => {
	jest.setTimeout(30_000); // the full parallel suite stretches ~700 ms of work past the 5 s default
	it("passes the seven steps, restart included", async () => {
		let { svc, ledger } = boot();
		await svc.start();
		await svc.rearm({ scope: "global" }, "fresh install", "operator"); // no state file yet: engaged (state_missing)

		// 1. An order flow on two symbols, with one resting order each.
		for (const s of ["BTCUSDT", "ETHUSDT"] as const) {
			for (let n = 0; n < 2; n++) {
				expect((await svc.submitIntent(intent(s))).status).toBe("filled");
			}
			expect(
				(await svc.submitIntent(intent(s, { limitPrice: PRICE[s] * 0.995 })))
					.status
			).toBe("acknowledged");
		}
		expect(svc.status().openOrders).toBe(2);

		// 2. Per-symbol switch: that symbol stops and its resting order is cancelled, the other trades.
		let t = performance.now();
		await svc.engage(
			{ scope: "symbol", symbol: "BTCUSDT" },
			"drill",
			"operator"
		);
		timings.symbolSwitchToLastCancelMs = Math.round(performance.now() - t);
		expect(await svc.submitIntent(intent("BTCUSDT"))).toMatchObject({
			reason: "kill_switch",
		});
		expect((await svc.submitIntent(intent("ETHUSDT"))).status).toBe("filled");
		expect((await ledger.account()).openOrders).toHaveLength(1);

		// 3. Global switch: no new order, open orders cancelled.
		t = performance.now();
		await svc.engage({ scope: "global" }, "drill", "operator");
		timings.globalSwitchToLastCancelMs = Math.round(performance.now() - t);
		expect(svc.status().openOrders).toBe(0);
		expect((await ledger.account()).openOrders).toEqual([]);
		t = performance.now();
		expect(await svc.submitIntent(intent("ETHUSDT"))).toMatchObject({
			reason: "kill_switch",
		});
		timings.rejectedIntentMs = Math.round(performance.now() - t);

		// 4. Restart: the switch stays on (state and ledger rebuilt from disk).
		({ svc, ledger } = boot());
		await svc.start();
		expect(svc.status().killSwitch.global).toBe("drill");
		expect(svc.isReady()).toBe(true);
		expect(await svc.submitIntent(intent("ETHUSDT"))).toMatchObject({
			reason: "kill_switch",
		});

		// 5. Re-arming with another identity than the operator is refused; by the operator it works.
		const h = createHandlers(svc, () => undefined);
		const body = {
			scope: "global" as const,
			reason: "cause understood",
		};
		const refused = await h.adminRearm(
			{ params: undefined, query: undefined, body },
			asCaller("api-gateway")
		);
		expect(refused.status).toBe(403);
		expect(svc.status().killSwitch.global).toBe("drill");

		// 6. Manual re-arming (the per-symbol switch of BTCUSDT too).
		const ok = await h.adminRearm(
			{ params: undefined, query: undefined, body },
			{
				...(asCaller("api-gateway") as object),
				headers: { "x-actor": "operator" },
			} as never
		);
		expect(ok.status).toBe(200);
		await svc.rearm(
			{ scope: "symbol", symbol: "BTCUSDT" },
			"cause understood",
			"operator"
		);
		expect(svc.status().killSwitch).toEqual({ global: null, symbols: {} });
		expect((await svc.submitIntent(intent("BTCUSDT"))).status).toBe("filled");
		expect(RISK_API.adminRearm.path).toBe("/v1/admin/kill-switch/rearm");

		// 7. Each automatic trigger in turn, from a fresh state and a fresh paper ledger.
		const fresh = async () => {
			await rm(join(dir, "state.json"), { force: true });
			await rm(join(dir, "ledger.json"), { force: true });
			market = { ...PRICE };
			feedStoppedAt = null;
			const booted = boot();
			await booted.svc.start();
			await booted.svc.rearm({ scope: "global" }, "fresh state", "operator");
			for (let n = 0; n < 2; n++) {
				await booted.svc.submitIntent(intent("BTCUSDT", { quantity: 0.05 }));
			}
			return booted;
		};

		// 7a. Loss past the daily limit (fake prices).
		({ svc } = await fresh());
		market.BTCUSDT = 20_000;
		await svc.tick();
		expect(svc.status().killSwitch.global).toBe("daily_loss");

		// 7b. Stale data (the feed stops).
		({ svc } = await fresh());
		feedStoppedAt = clock;
		clock += 16 * 60_000;
		await svc.tick();
		expect(svc.status().killSwitch.global).toBe("stale_data");

		// 7c. Reconciliation mismatch (the paper ledger changes behind the service).
		({ svc, ledger } = await fresh());
		await ledger.submit({
			clientOrderId: "ghost",
			symbol: "ETHUSDT",
			side: "buy",
			quantity: 1,
			referencePrice: 3_000,
		});
		clock += 301_000;
		await svc.tick();
		expect(svc.status().killSwitch.global).toBe("reconciliation");
		expect(svc.isReady()).toBe(false);
	});

	it("7d. engages on a reject storm (fake broker rejecting)", async () => {
		const rejecting: BrokerPort = {
			submit: async (o) => ({
				clientOrderId: o.clientOrderId,
				status: "rejected",
				filledQty: 0,
				quoteQty: 0,
				fee: 0,
			}),
			query: async () => null,
			cancel: async () => null,
			account: async () => ({
				cash: LIMITS.allocatedCapital,
				positions: {},
				openOrders: [],
			}),
			haltedSymbols: async () => [],
		};
		await rm(join(dir, "state.json"), { force: true });
		const { svc } = boot(rejecting);
		await svc.start();
		await svc.rearm({ scope: "global" }, "fresh state", "operator");
		for (let n = 0; n < 5; n++) {
			await svc.submitIntent(intent("BTCUSDT", { quantity: 0.001 }));
			clock += 13_000;
		}
		expect(svc.status().killSwitch.symbols.BTCUSDT).toBe("rejects");
	});
});
