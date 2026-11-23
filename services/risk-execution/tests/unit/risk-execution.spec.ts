import { beforeEach, describe, expect, it } from "@jest/globals";
import { PaperBroker } from "../../src/adapters/outbound/paper-broker";
import {
	RiskExecution,
	type RiskExecutionDeps,
} from "../../src/application/risk-execution";
import { assertExecutionLock } from "../../src/domain/execution-mode";
import { HARD_CEILINGS, RiskLimits } from "../../src/domain/limits";
import {
	FINAL,
	type Order,
	type OrderStatus,
	transition,
} from "../../src/domain/order";
import type {
	BrokerOrderView,
	BrokerPort,
	StatePort,
} from "../../src/domain/ports";
import { type Intent, preTradeReject } from "../../src/domain/pre-trade";
import { equity, newState, type RiskState } from "../../src/domain/state";
import { RestingBroker } from "../resting-broker";

const T0 = Date.parse("2026-11-20T10:00:00Z");
const CAPITAL = 100_000;
const LIMITS = RiskLimits.parse({
	allocatedCapital: CAPITAL,
	instruments: { BTCUSDT: { maxQuantity: 0.1 }, ETHUSDT: { maxQuantity: 2 } },
});

class MemoryStore<T> implements StatePort<T> {
	value: T | null = null;
	unreadable = false;
	async load() {
		if (this.unreadable) {
			throw new Error("corrupt");
		}
		return this.value === null
			? null
			: (JSON.parse(JSON.stringify(this.value)) as T);
	}
	async save(state: T) {
		this.value = JSON.parse(JSON.stringify(state)) as T;
	}
}

let clock = T0;
let admissible = true;
/** The market the service reads: price per symbol, observed now unless `marketAt` freezes the feed. */
let market: Record<string, number> = {};
let marketAt: number | null = null;
let feedDown = false;
let seq = 0;
const intent = (over: Partial<Intent> = {}): Intent => ({
	decisionId: `d${++seq}`,
	symbol: "BTCUSDT",
	side: "buy",
	quantity: 0.05,
	referencePrice: 60_000,
	referenceAt: clock,
	model: { symbol: "BTCUSDT", version: "v1" },
	allowRepeat: true,
	...over,
});

function build(
	over: Partial<RiskExecutionDeps> & { broker?: BrokerPort } = {}
) {
	const ledger = new MemoryStore<never>();
	const store = new MemoryStore<RiskState>();
	store.value = newState((over.limits ?? LIMITS).allocatedCapital, T0); // an installed service: a missing state engages the switch
	const broker =
		over.broker ?? new RestingBroker(new PaperBroker(ledger, CAPITAL));
	const events: string[] = [];
	const svc = new RiskExecution({
		limits: LIMITS,
		broker,
		store,
		admission: { isAdmissible: async () => admissible },
		prices: {
			latest: async (symbols) => {
				if (feedDown) {
					throw new Error("ECONNREFUSED");
				}
				return Object.fromEntries(
					symbols
						.filter((sym) => market[sym])
						.map((sym) => [sym, { price: market[sym], at: marketAt ?? clock }])
				);
			},
		},
		mode: "paper",
		ownerActor: "owner",
		now: () => clock,
		emit: (e, f) => events.push(`${e}:${f.reason ?? f.status ?? ""}`),
		...over,
	});
	return { svc, store, broker, ledger, events };
}

beforeEach(() => {
	clock = T0;
	admissible = true;
	seq = 0;
	market = { BTCUSDT: 60_000, ETHUSDT: 3_000 };
	marketAt = null;
	feedDown = false;
});

describe("preTradeReject on crafted states", () => {
	const reasonFor = (edit: (s: RiskState) => void) => {
		const state = newState(CAPITAL, T0);
		edit(state);
		return preTradeReject({
			intent: intent({ allowRepeat: false }),
			limits: LIMITS,
			state,
			now: T0,
			admissible: true,
			reconciled: true,
			halted: [],
			price: { price: 60_000, at: T0 },
		});
	};

	it.each<[string, (s: RiskState) => void, string]>([
		[
			"leverage",
			(s) => {
				s.cash = 1_000;
			},
			"leverage",
		],
		[
			"insufficient balance",
			(s) => {
				s.cash = 3_000;
			},
			"insufficient_balance",
		],
		[
			"global order rate",
			(s) => {
				for (let n = 0; n < LIMITS.ordersPerMinuteGlobal; n++) {
					s.orders[`o${n}`] = {
						symbol: `S${n}`,
						status: "filled",
						createdAt: T0,
					} as unknown as RiskState["orders"][string];
				}
			},
			"rate_global",
		],
		[
			"daily loss",
			(s) => {
				s.day.startEquity = CAPITAL * 1.02;
			},
			"loss_limit_daily",
		],
		[
			"symbol daily loss",
			(s) => {
				s.day.symbols.BTCUSDT = { startValue: 1_000, flow: 0 };
			},
			"loss_limit_symbol",
		],
	])("rejects %s", (_n, edit, expected) => {
		expect(reasonFor(edit)).toBe(expected);
	});
});

describe("pre-trade checks (ADR-0064 §2)", () => {
	const reject = async (
		i: Partial<Intent>,
		setup?: (s: ReturnType<typeof build>) => Promise<void>
	) => {
		const ctx = build();
		await ctx.svc.start();
		await setup?.(ctx);
		const r = await ctx.svc.submitIntent(intent(i));
		return r.status === "rejected" ? r.reason : "accepted";
	};

	it.each<[string, Partial<Intent>, string]>([
		[
			"unlisted symbol",
			{ symbol: "DOGEUSDT", model: { symbol: "DOGEUSDT", version: "v1" } },
			"instrument_not_allowed",
		],
		[
			"quantity cap + 1",
			{ quantity: 0.1001, referencePrice: 100 },
			"max_quantity",
		],
		["notional cap", { quantity: 0.09 }, "max_notional"],
		["price outside the band", { limitPrice: 63_000 }, "price_band"],
		["stale intent (> 1 min)", { referenceAt: T0 - 61_000 }, "stale_intent"],
		["short selling", { side: "sell" }, "short_selling"],
		[
			"model admitted on another symbol",
			{ model: { symbol: "ETHUSDT", version: "v1" } },
			"model_symbol_mismatch",
		],
		["future intent", { referenceAt: T0 + 6000 }, "stale_intent"],
	])("rejects %s", async (_n, i, expected) => {
		expect(await reject(i)).toBe(expected);
	});

	it("accepts the cap itself and a price inside the band", async () => {
		expect(await reject({ quantity: 0.05, limitPrice: 60_300 })).toBe(
			"accepted"
		);
	});

	it("rejects a model that is not admitted", async () => {
		admissible = false;
		expect(await reject({})).toBe("model_not_admitted");
	});

	it("rejects a gap between the intent and the price the service reads", async () => {
		market.BTCUSDT = 61_500;
		expect(await reject({ referencePrice: 60_000 })).toBe("price_gap");
	});

	it("fails closed when the price read fails, finds none or finds it too old", async () => {
		feedDown = true;
		expect(await reject({})).toBe("stale_price");
		feedDown = false;
		delete market.BTCUSDT;
		expect(await reject({})).toBe("stale_price");
		market.BTCUSDT = 60_000;
		marketAt = clock - LIMITS.haltAgeMs - 1;
		expect(await reject({})).toBe("stale_price");
	});

	it("values the order at the price read, not at the intent's, and fills there", async () => {
		market.BTCUSDT = 100_000;
		// Notional at the read price (6 000 > 5 % of 100 000): at the intent's it would fit, then fail the gap.
		expect(await reject({ quantity: 0.06, referencePrice: 50_000 })).toBe(
			"max_notional"
		);
		// Marked and filled (slippage 5 bps, fee 10 bps) at the read price, not at the intent's.
		const ctx = build();
		await ctx.svc.start();
		await ctx.svc.submitIntent(
			intent({ quantity: 0.04, referencePrice: 99_500 })
		);
		expect(ctx.svc.status().exposureRatio).toBeCloseTo(0.04, 6);
		expect(CAPITAL - (await ctx.broker.account()).cash).toBeCloseTo(
			0.04 * 100_000 * 1.0005 * 1.001
		);
		// Worst-case loss at the read price: 0.01 x 60 500 x 1 % = 6.05 tips the daily loss past 2 000, 6.00 would not.
		const state = newState(CAPITAL, T0);
		state.day.startEquity = CAPITAL + 1_993.98;
		const lossCheck = (price: number) =>
			preTradeReject({
				intent: intent({ quantity: 0.01, allowRepeat: false }),
				limits: LIMITS,
				state,
				now: T0,
				admissible: true,
				reconciled: true,
				halted: [],
				price: { price, at: T0 },
			});
		expect(lossCheck(60_000)).toBeNull();
		expect(lossCheck(60_500)).toBe("loss_limit_daily");
	});

	it("caps the exposure per instrument counting open orders as filled", async () => {
		const ctx = build();
		await ctx.svc.start();
		// Resting buy limit below the market: stays open and still counts.
		for (let n = 0; n < 3; n++) {
			await ctx.svc.submitIntent(
				intent({ quantity: 0.08, limitPrice: 59_500 })
			); // 14 400 of 15 000
		}
		const fourth = await ctx.svc.submitIntent(
			intent({ quantity: 0.08, limitPrice: 59_500 })
		);
		expect(fourth).toMatchObject({
			status: "rejected",
			reason: "instrument_exposure",
		});
	});

	it("rejects a sell hedged only by an open buy", async () => {
		const ctx = build();
		await ctx.svc.start();
		await ctx.svc.submitIntent(intent({ limitPrice: 59_500 })); // resting buy
		const r = await ctx.svc.submitIntent(intent({ side: "sell" }));
		expect(r).toMatchObject({ status: "rejected", reason: "short_selling" });
	});

	it("rejects a buy over the cap even with an open sell", () => {
		const state = newState(CAPITAL, T0);
		state.positions.BTCUSDT = 0.2;
		state.orders.o1 = {
			symbol: "BTCUSDT",
			side: "sell",
			status: "acknowledged",
			quantity: 0.2,
			filledQty: 0,
			createdAt: T0,
		} as unknown as Order;
		expect(
			preTradeReject({
				intent: intent({ quantity: 0.06, allowRepeat: false }),
				limits: LIMITS,
				state,
				now: T0,
				admissible: true,
				reconciled: true,
				halted: [],
				price: { price: 60_000, at: T0 },
			})
		).toBe("instrument_exposure");
		// Exposure is valued at the read price, not the intent's (gap 0.83 % < band).
		const check = (quantity: number, positions: Record<string, number>) => {
			const s = newState(CAPITAL, T0);
			s.positions = positions;
			s.marks.ETHUSDT = { price: 3_000, at: T0 };
			return preTradeReject({
				intent: intent({ quantity, referencePrice: 59_500 }),
				limits: LIMITS,
				state: s,
				now: T0,
				admissible: true,
				reconciled: true,
				halted: [],
				price: { price: 60_000, at: T0 },
			});
		};
		expect(check(0.051, { BTCUSDT: 0.2 })).toBe("instrument_exposure"); // 15 060 > 15 000
		expect(check(0.001, { BTCUSDT: 0.2, ETHUSDT: 6 })).toBe("global_exposure"); // 30 060 > 30 000
	});

	it("caps the global exposure across two instruments (30 %)", async () => {
		const limits = RiskLimits.parse({
			...LIMITS,
			instrumentExposurePct: 0.3,
			orderNotionalPct: 0.1,
			instruments: {
				BTCUSDT: { maxQuantity: 1 },
				ETHUSDT: { maxQuantity: 50 },
			},
		});
		const ctx = build({ limits });
		await ctx.svc.start();
		for (let n = 0; n < 3; n++) {
			await ctx.svc.submitIntent(intent({ quantity: 0.16 })); // 28 800 of 30 000
		}
		const r = await ctx.svc.submitIntent(
			intent({
				symbol: "ETHUSDT",
				quantity: 1,
				referencePrice: 3_000,
				model: { symbol: "ETHUSDT", version: "v1" },
			})
		);
		expect(r).toMatchObject({ reason: "global_exposure" });
	});

	it("reserves the balance of open orders", async () => {
		const limits = RiskLimits.parse({
			...LIMITS,
			allocatedCapital: 10_000,
			instrumentExposurePct: 0.3,
			orderNotionalPct: 0.1,
			instruments: { BTCUSDT: { maxQuantity: 1 } },
		});
		const ctx = build({
			limits,
			broker: new PaperBroker(new MemoryStore<never>(), 10_000),
		});
		await ctx.svc.start();
		// A resting buy reserves 900; cash 10 000 - 900 < 9 999 needed? Use a wide second order.
		await ctx.svc.submitIntent(
			intent({ quantity: 0.0165, referencePrice: 60_000, limitPrice: 59_500 })
		); // ~981 reserved
		const r = await ctx.svc.submitIntent(
			intent({ quantity: 0.0165, referencePrice: 60_000 })
		); // fits cash, exposure ok
		expect(r.status).not.toBe("rejected");
	});

	it("rejects a replayed intent with no second broker call, and the duplicate window", async () => {
		const ctx = build();
		await ctx.svc.start();
		const first = intent({ allowRepeat: false });
		await ctx.svc.submitIntent(first);
		const replay = await ctx.svc.submitIntent(first);
		expect(replay).toMatchObject({ reason: "duplicate_client_order_id" });
		const same = await ctx.svc.submitIntent(intent({ allowRepeat: false }));
		expect(same).toMatchObject({ reason: "duplicate_window" });
		expect((await ctx.broker.account()).positions.BTCUSDT).toBeCloseTo(0.05);
	});

	it("purges final orders past the longest window on save, yet a late replay of the same decisionId is still a duplicate and not counted twice", async () => {
		const ctx = build();
		await ctx.svc.start();
		const original = intent({ allowRepeat: false });
		const first = await ctx.svc.submitIntent(original);
		clock += 61_000;
		const again = await ctx.svc.submitIntent(
			intent({ allowRepeat: false, referenceAt: clock })
		);
		expect(again.status).not.toBe("rejected");
		const replay = await ctx.svc.submitIntent({
			...original,
			referenceAt: clock,
		});
		expect(replay).toMatchObject({ reason: "duplicate_client_order_id" });
		const state = ctx.store.value as RiskState;
		expect(state.orders[first.clientOrderId]).toBeUndefined();
		expect(state.seen?.[first.clientOrderId]).toBeDefined();
		expect(state.orders[again.clientOrderId]).toBeDefined();
		expect(state.positions.BTCUSDT).toBeCloseTo(
			(await ctx.broker.account()).positions.BTCUSDT
		);
	});

	it("a replay under the kill switch never rewrites the existing order", async () => {
		const ctx = build();
		await ctx.svc.start();
		const first = intent();
		const r = await ctx.svc.submitIntent(first);
		await ctx.svc.engage({ scope: "global" }, "operator", "ops");
		expect(await ctx.svc.submitIntent(first)).toMatchObject({
			reason: "duplicate_client_order_id",
		});
		expect(
			(ctx.store.value as RiskState).orders[r.clientOrderId]
		).toMatchObject({ status: "filled", filledQty: 0.05 });
	});

	it("limits the order rate with a fake clock", async () => {
		const ctx = build();
		await ctx.svc.start();
		const reasons: string[] = [];
		for (let n = 0; n < 6; n++) {
			const r = await ctx.svc.submitIntent(intent({ quantity: 0.001 }));
			reasons.push(r.reason ?? "ok");
			clock += 1_000;
		}
		expect(reasons.slice(0, 5)).toEqual(new Array(5).fill("ok"));
		expect(reasons[5]).toBe("rate_symbol");
		clock += 61_000;
		expect(
			(
				await ctx.svc.submitIntent(
					intent({ quantity: 0.001, referenceAt: clock })
				)
			).status
		).not.toBe("rejected");
	});

	it("rejects an instrument the broker reports halted", async () => {
		const broker = new PaperBroker(new MemoryStore<never>(), CAPITAL);
		broker.haltedSymbols = async () => ["BTCUSDT"];
		const ctx = build({ broker });
		await ctx.svc.start();
		expect(await ctx.svc.submitIntent(intent())).toMatchObject({
			reason: "instrument_halted",
		});
	});

	it("refuses a configuration above a hard ceiling", () => {
		expect(() =>
			RiskLimits.parse({
				...LIMITS,
				globalExposurePct: HARD_CEILINGS.globalExposurePct + 0.01,
			})
		).toThrow();
		expect(() =>
			RiskLimits.parse({ ...LIMITS, maxIntentAgeMs: 61_000 })
		).toThrow();
		expect(() => RiskLimits.parse({ allocatedCapital: 1 })).toThrow();
	});
});

describe("order lifecycle (ADR-0064 §3)", () => {
	const states = Object.keys({
		received: 0,
		rejected: 0,
		accepted: 0,
		submitted: 0,
		acknowledged: 0,
		broker_rejected: 0,
		unknown: 0,
		partially_filled: 0,
		filled: 0,
		cancel_requested: 0,
		cancelled: 0,
		expired: 0,
	}) as OrderStatus[];

	it("final states have no way out, and an illegal transition is an error", () => {
		for (const from of states.filter((s) => FINAL.has(s))) {
			for (const to of states) {
				expect(() =>
					transition({ status: from, clientOrderId: "x" } as Order, to)
				).toThrow(/Illegal order transition/);
			}
		}
		expect(() =>
			transition({ status: "received", clientOrderId: "x" } as Order, "filled")
		).toThrow();
		expect(() =>
			transition(
				{ status: "accepted", clientOrderId: "x" } as Order,
				"submitted"
			)
		).not.toThrow();
	});

	it("crash between accepted and submitted: restart sends one broker order with the same id", async () => {
		const a = build();
		await a.svc.start();
		// The process dies after the durable write of `accepted`.
		a.store.value = {
			...(a.store.value as RiskState),
			orders: {
				"rx-crash": {
					clientOrderId: "rx-crash",
					decisionId: "crash",
					symbol: "BTCUSDT",
					side: "buy",
					quantity: 0.05,
					referencePrice: 60_000,
					status: "accepted",
					filledQty: 0,
					quoteQty: 0,
					fee: 0,
					createdAt: clock,
					mode: "paper",
				},
			},
		};
		const b = build({ store: a.store, broker: a.broker });
		await b.svc.start();
		await b.svc.start();
		const account = await a.broker.account();
		expect(account.positions.BTCUSDT).toBeCloseTo(0.05);
		expect(Object.keys((a.store.value as RiskState).orders)).toEqual([
			"rx-crash",
		]);
		expect((a.store.value as RiskState).orders["rx-crash"].status).toBe(
			"filled"
		);
	});

	it("restart: the broker is reconciled before an accepted order is sent", async () => {
		const a = build();
		await a.svc.start();
		const calls: string[] = [];
		const broker: BrokerPort = {
			submit: (o) => {
				calls.push("submit");
				return a.broker.submit(o);
			},
			query: (id) => a.broker.query(id),
			cancel: (id) => a.broker.cancel(id),
			account: () => {
				calls.push("account");
				return a.broker.account();
			},
			haltedSymbols: async () => [],
		};
		const state = a.store.value as RiskState;
		state.orders = {
			acc: {
				clientOrderId: "acc",
				decisionId: "acc",
				symbol: "BTCUSDT",
				side: "buy",
				quantity: 0.05,
				referencePrice: 60_000,
				status: "accepted",
				filledQty: 0,
				quoteQty: 0,
				fee: 0,
				createdAt: clock,
				mode: "paper",
			},
		};
		await build({ store: a.store, broker }).svc.start();
		expect(calls.slice(0, 2)).toEqual(["account", "submit"]);
	});

	it("restart: an accepted order too old or under a switch expires unsent", async () => {
		const a = build();
		await a.svc.start();
		await a.svc.engage(
			{ scope: "symbol", symbol: "ETHUSDT" },
			"operator",
			"ops"
		);
		const accepted = (id: string, symbol: string, createdAt: number) => ({
			clientOrderId: id,
			decisionId: id,
			symbol,
			side: "buy" as const,
			quantity: 0.05,
			referencePrice: 60_000,
			status: "accepted" as const,
			filledQty: 0,
			quoteQty: 0,
			fee: 0,
			createdAt,
			mode: "paper" as const,
		});
		const state = a.store.value as RiskState;
		state.orders = {
			old: accepted("old", "BTCUSDT", clock),
			off: accepted("off", "ETHUSDT", clock + 7_200_000),
		};
		clock += 7_200_000; // 2 h later
		await build({ store: a.store, broker: a.broker }).svc.start();
		const orders = (a.store.value as RiskState).orders;
		expect([orders.old, orders.off?.status]).toEqual([undefined, "expired"]); // old: expired, then purged
		expect(await a.broker.query("old")).toBeNull();
	});

	it("broker unreachable: the intent ends unknown, none passes until a reconciliation does", async () => {
		const inner = new PaperBroker(new MemoryStore<never>(), CAPITAL);
		let down = false;
		const up = <T>(fn: () => Promise<T>) =>
			down ? Promise.reject(new Error("ECONNREFUSED")) : fn();
		const broker: BrokerPort = {
			submit: async (o) => {
				const view = await inner.submit(o); // reaches the ledger, the answer is lost
				return up(async () => view);
			},
			query: (id) => up(() => inner.query(id)),
			cancel: (id) => inner.cancel(id),
			account: () => up(() => inner.account()),
			haltedSymbols: async () => [],
		};
		const ctx = build({ broker });
		await ctx.svc.start();
		down = true;
		expect((await ctx.svc.submitIntent(intent())).status).toBe("unknown");
		expect(ctx.svc.isReady()).toBe(false);
		await ctx.svc.tick();
		expect(ctx.svc.status().mismatch).toBe(false); // unreachable is not a mismatch
		down = false;
		expect(await ctx.svc.submitIntent(intent())).toMatchObject({
			reason: "not_reconciled",
		});
		await ctx.svc.tick();
		expect(ctx.svc.isReady()).toBe(true);
		expect((await ctx.svc.submitIntent(intent())).status).toBe("filled");
	});

	it("a timeout goes to unknown, is never resent, and resumes from the broker's answer", async () => {
		const inner = new PaperBroker(new MemoryStore<never>(), CAPITAL);
		let submits = 0;
		const flaky: BrokerPort = {
			...inner,
			submit: async (o) => {
				submits++;
				await inner.submit(o); // reaches the exchange...
				throw new Error("timeout"); // ...but the answer is lost
			},
			query: (id) => inner.query(id),
			cancel: (id) => inner.cancel(id),
			account: () => inner.account(),
			haltedSymbols: async () => [],
		};
		const ctx = build({ broker: flaky });
		await ctx.svc.start();
		const r = await ctx.svc.submitIntent(intent());
		expect(submits).toBe(1);
		expect(r.status).toBe("filled");
		expect(ctx.svc.status().killSwitch.global).toBeNull();
	});

	it("sums partial fills from the broker, not from the requested quantity", async () => {
		let view: BrokerOrderView = {
			clientOrderId: "",
			status: "open",
			filledQty: 0,
			quoteQty: 0,
			fee: 0,
		};
		const broker: BrokerPort = {
			submit: async (o) => {
				view = {
					clientOrderId: o.clientOrderId,
					status: "partially_filled",
					filledQty: 0.02,
					quoteQty: 1_200,
					fee: 1.2,
				};
				return view;
			},
			query: async () => view,
			cancel: async () => ({ ...view, status: "cancelled" }),
			account: async () => ({ cash: CAPITAL, positions: {}, openOrders: [] }),
			haltedSymbols: async () => [],
		};
		const ctx = build({ broker });
		await ctx.svc.start();
		await ctx.svc.submitIntent(intent());
		expect(ctx.svc.status().positions.BTCUSDT).toBeCloseTo(0.02);
		expect(ctx.svc.status().exposureRatio).toBeGreaterThan(0);
		view = {
			...view,
			status: "filled",
			filledQty: 0.05,
			quoteQty: 3_000,
			fee: 3,
		};
		await ctx.svc.tick();
		expect(ctx.svc.status().positions.BTCUSDT).toBeCloseTo(0.05);
	});

	it("the paper broker cancels a non-marketable limit at once, without a rejection", async () => {
		const ctx = build({
			broker: new PaperBroker(new MemoryStore<never>(), CAPITAL),
		});
		await ctx.svc.start();
		const r = await ctx.svc.submitIntent(intent({ limitPrice: 59_500 }));
		expect(await ctx.broker.query(r.clientOrderId)).toMatchObject({
			status: "cancelled",
		});
		expect((await ctx.broker.account()).openOrders).toEqual([]);
		expect(ctx.events.some((e) => e.includes("rejected"))).toBe(false);
	});

	it("the balance check reserves the simulated slippage", () => {
		const state = newState(CAPITAL, T0);
		state.cash = 1_000; // 999 + 10 bps fee fits; the 5 bps of slippage does not
		expect(
			preTradeReject({
				intent: intent({
					quantity: 0.01665,
					referencePrice: 60_000,
					allowRepeat: false,
				}),
				limits: LIMITS,
				state,
				now: T0,
				admissible: true,
				reconciled: true,
				halted: [],
				price: { price: 60_000, at: T0 },
			})
		).toBe("insufficient_balance");
	});

	it("a resting order expires and a broker rejection is final", async () => {
		const ctx = build();
		await ctx.svc.start();
		const r = await ctx.svc.submitIntent(intent({ limitPrice: 59_500 }));
		expect(r.status).toBe("acknowledged");
		clock += LIMITS.orderTtlMs + 1;
		await ctx.svc.tick();
		expect(
			(ctx.store.value as RiskState).orders[r.clientOrderId]
		).toBeUndefined(); // expired, then purged
		expect((await ctx.broker.account()).openOrders).toEqual([]);
	});
});

describe("kill switch and limits (ADR-0064 §5, policy §3-§4)", () => {
	it("engages on the daily loss, cancels open orders, survives a restart, re-arms by hand only", async () => {
		const ctx = build();
		await ctx.svc.start();
		await ctx.svc.submitIntent(intent({ quantity: 0.08 })); // 4 800 notional
		const resting = await ctx.svc.submitIntent(
			intent({ limitPrice: 59_500, quantity: 0.0001 })
		);
		market.BTCUSDT = 30_000; // -2 400 on 0.08 BTC: past 2 % of 100 000
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.global).toBe("daily_loss");
		expect(
			(ctx.store.value as RiskState).orders[resting.clientOrderId].status
		).toBe("cancelled");
		const restarted = build({ store: ctx.store, broker: ctx.broker });
		await restarted.svc.start();
		expect(restarted.svc.status().killSwitch.global).toBe("daily_loss");
		expect(await restarted.svc.submitIntent(intent())).toMatchObject({
			reason: "kill_switch",
		});
		clock += 86_400_000; // a new UTC day re-arms nothing
		await restarted.svc.tick();
		expect(restarted.svc.status().killSwitch.global).toBe("daily_loss");
		await restarted.svc.rearm(
			{ scope: "global" },
			"cause understood",
			"operator"
		);
		expect(restarted.svc.status().killSwitch.global).toBeNull();
	});

	it("per symbol: the other symbol keeps trading; manual engagement works on both scopes", async () => {
		const ctx = build();
		await ctx.svc.start();
		await ctx.svc.engage(
			{ scope: "symbol", symbol: "BTCUSDT" },
			"operator",
			"ops"
		);
		expect(await ctx.svc.submitIntent(intent())).toMatchObject({
			reason: "kill_switch",
		});
		expect(
			(
				await ctx.svc.submitIntent(
					intent({
						symbol: "ETHUSDT",
						quantity: 1,
						referencePrice: 3_000,
						model: { symbol: "ETHUSDT", version: "v1" },
					})
				)
			).status
		).toBe("filled");
		await ctx.svc.engage({ scope: "global" }, "operator", "ops");
		expect(ctx.svc.status().killSwitch.global).toBe("operator");
	});

	it("drawdown stop: only the owner re-arms", async () => {
		const ctx = build();
		await ctx.svc.start();
		await ctx.svc.engage({ scope: "global" }, "drawdown", "system");
		await expect(
			ctx.svc.rearm({ scope: "global" }, "reviewed", "operator")
		).rejects.toThrow(/owner/);
		await ctx.svc.rearm({ scope: "global" }, "strategy reviewed", "owner");
		expect(ctx.svc.status().killSwitch.global).toBeNull();
	});

	it("drawdown replaces an earlier reason: only the owner re-arms", async () => {
		const ctx = build();
		await ctx.svc.start();
		await ctx.svc.engage({ scope: "global" }, "daily_loss", "system");
		await ctx.svc.engage({ scope: "global" }, "drawdown", "system");
		expect(ctx.svc.status().killSwitch.global).toBe("drawdown");
		await expect(
			ctx.svc.rearm({ scope: "global" }, "x", "ops")
		).rejects.toThrow(/owner/);
		await ctx.svc.rearm({ scope: "global" }, "reviewed", "owner");
		expect(ctx.svc.status().killSwitch.global).toBeNull();
	});

	it("drawdown stop engages by itself, cancels open orders, and the owner's re-arm restarts from current equity", async () => {
		const emitted: Record<string, unknown>[] = [];
		const ctx = build({
			limits: RiskLimits.parse({ ...LIMITS, drawdownPct: 0.005 }),
			emit: (e, f) => e === "kill_switch.rearmed" && emitted.push(f),
		});
		await ctx.svc.start();
		await ctx.svc.submitIntent(intent()); // 0.05 BTC, 3 000 notional
		const resting = await ctx.svc.submitIntent(
			intent({ limitPrice: 59_500, quantity: 0.0001 })
		);
		market.BTCUSDT = 48_000; // -600: past 0.5 %, under the 2 % daily and 1 % symbol limits
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.global).toBe("drawdown");
		expect(
			(ctx.store.value as RiskState).orders[resting.clientOrderId].status
		).toBe("cancelled");
		await ctx.svc.rearm({ scope: "global" }, "strategy reviewed", "owner");
		const state = ctx.store.value as RiskState;
		expect(state.hwm).toBe(equity(state));
		expect(emitted[0]).toMatchObject({ hwm: state.hwm });
		expect(emitted[0].previousHwm).toBeGreaterThan(state.hwm);
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.global).toBeNull();
	});

	it("an unreadable state counts as on and cannot be re-armed", async () => {
		const ctx = build();
		ctx.store.unreadable = true;
		await ctx.svc.start();
		expect(ctx.svc.status().killSwitch.global).toBe("state_unreadable");
		expect(ctx.svc.isReady()).toBe(false);
		expect(await ctx.svc.submitIntent(intent())).toMatchObject({
			reason: "kill_switch",
		});
		await expect(
			ctx.svc.rearm({ scope: "global" }, "x", "owner")
		).rejects.toThrow(/unreadable/);
	});

	it("a missing state (install or lost volume) counts as on until an operator re-arms", async () => {
		const ctx = build();
		ctx.store.value = null;
		await ctx.svc.start();
		expect(ctx.svc.status().killSwitch.global).toBe("state_missing");
		expect(ctx.events).toContain("kill_switch.engaged:state_missing");
		expect(await ctx.svc.submitIntent(intent())).toMatchObject({
			reason: "kill_switch",
		});
		await ctx.svc.rearm({ scope: "global" }, "fresh install checked", "ops");
		expect((await ctx.svc.submitIntent(intent())).status).toBe("filled");
	});

	it("engages at once while an admission hangs, and the pending intent is then refused", async () => {
		let release: (ok: boolean) => void = () => undefined;
		const ctx = build({
			admission: {
				isAdmissible: () =>
					new Promise<boolean>((resolve) => {
						release = resolve;
					}),
			},
		});
		await ctx.svc.start();
		const pending = ctx.svc.submitIntent(intent());
		await ctx.svc.engage({ scope: "global" }, "operator", "ops");
		expect(ctx.svc.status().killSwitch.global).toBe("operator");
		release(true);
		expect(await pending).toMatchObject({ reason: "kill_switch" });
	});

	it("a rearm queued before an engage does not clear it", async () => {
		const ctx = build();
		await ctx.svc.start();
		const rearmed = ctx.svc.rearm({ scope: "global" }, "ok", "ops");
		await ctx.svc.engage({ scope: "global" }, "panic", "ops");
		await rearmed;
		expect(ctx.svc.status().killSwitch.global).toBe("panic");
		expect((ctx.store.value as RiskState).killSwitch.global).toBe("panic");
	});

	it("a broker call that hangs times out instead of holding the queue", async () => {
		const inner = new PaperBroker(new MemoryStore<never>(), CAPITAL);
		const hang = () => new Promise<never>(() => undefined);
		const broker: BrokerPort = {
			submit: (o) => inner.submit(o),
			query: (id) => inner.query(id),
			cancel: (id) => inner.cancel(id),
			account: () => inner.account(),
			haltedSymbols: hang,
		};
		const ctx = build({
			broker,
			limits: RiskLimits.parse({ ...LIMITS, submitTimeoutMs: 20 }),
		});
		await ctx.svc.start();
		expect(await ctx.svc.submitIntent(intent())).toMatchObject({
			reason: "instrument_halted",
		});
		broker.account = hang;
		clock += 300_000; // reconciliation due: account() times out
		await ctx.svc.tick();
		expect(ctx.events).toContain("reconciliation.error:");
	});

	it("a tick still running absorbs the next timer tick", async () => {
		const ctx = build();
		await ctx.svc.start();
		expect(ctx.svc.tick()).toBe(ctx.svc.tick());
	});

	it("cancellation still works while the switch is on", async () => {
		const ctx = build();
		await ctx.svc.start();
		const r = await ctx.svc.submitIntent(intent({ limitPrice: 59_500 }));
		// Engaging cancels already; a manual cancel afterwards is a no-op on a final order, not an error.
		await ctx.svc.engage({ scope: "global" }, "operator", "ops");
		expect(await ctx.svc.cancel(r.clientOrderId)).toBe("cancelled");
		expect(await ctx.svc.cancel("nope")).toBe("not_found");
	});

	it("a failed cancel leaves the order cancel_requested and the ticks keep the limits", async () => {
		const inner = new RestingBroker(
			new PaperBroker(new MemoryStore<never>(), CAPITAL)
		);
		let cancelFails = true;
		const broker: BrokerPort = {
			submit: (o) => inner.submit(o),
			query: (id) => inner.query(id),
			cancel: async (id) => {
				if (cancelFails) {
					cancelFails = false;
					throw new Error("ECONNRESET");
				}
				return inner.cancel(id);
			},
			account: () => inner.account(),
			haltedSymbols: async () => [],
		};
		const ctx = build({ broker });
		await ctx.svc.start();
		await ctx.svc.submitIntent(intent({ quantity: 0.08 }));
		const resting = await ctx.svc.submitIntent(
			intent({ limitPrice: 59_500, quantity: 0.0001 })
		);
		expect(await ctx.svc.cancel(resting.clientOrderId)).toBe(
			"cancel_requested"
		);
		await ctx.svc.tick(); // the broker still sees it open
		const orders = () => (ctx.store.value as RiskState).orders;
		expect(orders()[resting.clientOrderId].status).toBe("cancel_requested");
		expect(ctx.events.filter((e) => e.startsWith("broker.error"))).toHaveLength(
			1
		); // the failed cancel only, no illegal transition at each tick
		market.BTCUSDT = 30_000;
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.global).toBe("daily_loss");
		expect(orders()[resting.clientOrderId].status).toBe("cancelled");
	});

	it("5 broker rejections engage the symbol, 10 the global switch (reject storm)", async () => {
		const broker: BrokerPort = {
			submit: async (o) => ({
				clientOrderId: o.clientOrderId,
				status: "rejected",
				filledQty: 0,
				quoteQty: 0,
				fee: 0,
			}),
			query: async () => null,
			cancel: async () => null,
			account: async () => ({ cash: CAPITAL, positions: {}, openOrders: [] }),
			haltedSymbols: async () => [],
		};
		const ctx = build({ broker });
		await ctx.svc.start();
		for (let n = 0; n < 5; n++) {
			await ctx.svc.submitIntent(intent({ quantity: 0.001 }));
			clock += 13_000; // keeps the order rate under its cap
		}
		expect(ctx.svc.status().killSwitch.symbols.BTCUSDT).toBe("rejects");
		for (let n = 0; n < 5; n++) {
			await ctx.svc.submitIntent(
				intent({
					symbol: "ETHUSDT",
					quantity: 0.01,
					referencePrice: 3_000,
					model: { symbol: "ETHUSDT", version: "v1" },
				})
			);
			clock += 13_000;
		}
		expect(ctx.svc.status().killSwitch.global).toBe("rejects");
	});
});

describe("reconciliation (ADR-0064 §4)", () => {
	it("is not ready before the first pass and engages the switch on an extra broker position", async () => {
		const ctx = build();
		expect(ctx.svc.isReady()).toBe(false);
		await ctx.svc.start();
		expect(ctx.svc.isReady()).toBe(true);
		// Someone changes the paper ledger behind the service.
		await ctx.broker.submit({
			clientOrderId: "ghost",
			symbol: "ETHUSDT",
			side: "buy",
			quantity: 1,
			referencePrice: 3_000,
		});
		clock += 301_000;
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.global).toBe("reconciliation");
		expect(ctx.svc.isReady()).toBe(false);
		expect(ctx.svc.status().mismatch).toBe(true);
		expect(
			ctx.events.some((e) => e.startsWith("reconciliation.mismatch"))
		).toBe(true);
	});
});

describe("stale data (ADR-0064 §7)", () => {
	it("halts a symbol after 15 min, and every symbol stale engages the global switch", async () => {
		const ctx = build();
		market = {}; // never read: not stale
		await ctx.svc.start();
		clock += 16 * 60_000;
		await ctx.svc.tick();
		expect(ctx.svc.status()).toMatchObject({
			killSwitch: { global: null, symbols: {} },
			oldestPriceAgeSeconds: 0,
		});
		market = { BTCUSDT: 60_000, ETHUSDT: 3_000 };
		await ctx.svc.tick();
		delete market.BTCUSDT; // the BTCUSDT feed stops, ETHUSDT keeps coming
		clock += 16 * 60_000;
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.symbols.BTCUSDT).toBe("stale_data");
		expect(ctx.svc.status().killSwitch.global).toBeNull();
		marketAt = clock; // every feed frozen
		clock += 16 * 60_000;
		await ctx.svc.tick();
		expect(ctx.svc.status().killSwitch.global).toBe("stale_data");
	});

	it("a frozen price read engages the halt even when every intent carries a fresh referenceAt", async () => {
		const ctx = build();
		await ctx.svc.start();
		marketAt = clock;
		for (let n = 0; n < 4; n++) {
			clock += 5 * 60_000;
			await ctx.svc.submitIntent(
				intent({ quantity: 0.001, referenceAt: clock })
			);
			await ctx.svc.tick();
		}
		expect(ctx.svc.status().killSwitch.global).toBe("stale_data");
		expect(ctx.svc.status().oldestPriceAgeSeconds).toBe(1_200);
	});
});

describe("paper/live lock (ADR-0064 §6)", () => {
	it.each([
		["live", "staging", true],
		["live", "production", false],
		["paper", "production", true],
	] as const)("refuses %s in %s (keys: %s)", (mode, env, hasLiveKeys) => {
		expect(() => assertExecutionLock({ mode, env, hasLiveKeys })).toThrow();
	});

	it.each([
		["paper", "development", false],
		["paper", "production", false],
		["live", "production", true],
	] as const)("allows %s in %s (keys: %s)", (mode, env, hasLiveKeys) => {
		expect(() => assertExecutionLock({ mode, env, hasLiveKeys })).not.toThrow();
	});
});
