import type {
	BrokerAccount,
	BrokerOrderRequest,
	BrokerOrderView,
	BrokerPort,
	StatePort,
} from "../../domain/ports";

interface Ledger {
	cash: number;
	positions: Record<string, number>;
	orders: Record<
		string,
		BrokerOrderView & { side: "buy" | "sell"; symbol: string }
	>;
}

/**
 * Simulated broker (ADR-0064 §6): an internal paper ledger, no exchange, no key.
 * Fills at the reference price moved against the order by `slippageBps`, with
 * `feeBps` of fee (the simulator's costs, rl-backend.ts); a limit that is not
 * marketable is cancelled at once (no matching engine would ever fill it).
 * shortcut: fills are all-or-nothing, partial fills come with a real adapter.
 */
export class PaperBroker implements BrokerPort {
	private _ledger: Ledger | null = null;

	constructor(
		private readonly _store: StatePort<Ledger>,
		private readonly _capital: number,
		private readonly _feeBps = 10,
		private readonly _slippageBps = 5
	) {}

	private async _load(): Promise<Ledger> {
		this._ledger ??= (await this._store.load()) ?? {
			cash: this._capital,
			positions: {},
			orders: {},
		};
		return this._ledger;
	}

	async submit(order: BrokerOrderRequest): Promise<BrokerOrderView> {
		const ledger = await this._load();
		const existing = ledger.orders[order.clientOrderId];
		if (existing) {
			return existing;
		}
		const sign = order.side === "buy" ? 1 : -1;
		const fillPrice =
			order.referencePrice * (1 + (sign * this._slippageBps) / 10_000);
		const marketable =
			order.limitPrice === undefined ||
			sign * (order.limitPrice - fillPrice) >= 0;
		const view = {
			clientOrderId: order.clientOrderId,
			// cancelled, not rejected: a rejection counts toward the `rejects` kill switch
			status: "cancelled" as BrokerOrderView["status"],
			filledQty: 0,
			quoteQty: 0,
			fee: 0,
			side: order.side,
			symbol: order.symbol,
		};
		if (marketable) {
			const notional = order.quantity * fillPrice;
			Object.assign(view, {
				status: "filled",
				filledQty: order.quantity,
				quoteQty: notional,
				fee: (notional * this._feeBps) / 10_000,
			});
			ledger.cash += -sign * notional - view.fee;
			ledger.positions[order.symbol] =
				(ledger.positions[order.symbol] ?? 0) + sign * order.quantity;
		}
		ledger.orders[order.clientOrderId] = view;
		await this._store.save(ledger);
		return view;
	}

	async query(id: string): Promise<BrokerOrderView | null> {
		return (await this._load()).orders[id] ?? null;
	}

	async cancel(id: string): Promise<BrokerOrderView | null> {
		const ledger = await this._load();
		const order = ledger.orders[id];
		if (order?.status === "open") {
			order.status = "cancelled";
			await this._store.save(ledger);
		}
		return order ?? null;
	}

	async account(): Promise<BrokerAccount> {
		const ledger = await this._load();
		return {
			cash: ledger.cash,
			positions: { ...ledger.positions },
			openOrders: Object.values(ledger.orders)
				.filter((order) => order.status === "open")
				.map((order) => order.clientOrderId),
		};
	}

	/** The simulator has no exchange: every instrument is in trading status. */
	haltedSymbols(): Promise<string[]> {
		return Promise.resolve([]);
	}
}
