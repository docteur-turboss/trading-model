import type { PaperBroker } from "../src/adapters/outbound/paper-broker";
import type {
	BrokerAccount,
	BrokerOrderRequest,
	BrokerOrderView,
	BrokerPort,
} from "../src/domain/ports";

/** Test double: the paper broker, except a non-marketable limit rests `open` as a real exchange would. */
export class RestingBroker implements BrokerPort {
	private readonly _open = new Map<string, BrokerOrderView>();

	constructor(private readonly _inner: PaperBroker) {}

	async submit(order: BrokerOrderRequest): Promise<BrokerOrderView> {
		const resting = this._open.get(order.clientOrderId);
		if (resting) {
			return resting;
		}
		const view = await this._inner.submit(order);
		if (view.status !== "cancelled") {
			return view;
		}
		const open = { ...view, status: "open" as const };
		this._open.set(order.clientOrderId, open);
		return open;
	}

	async query(id: string): Promise<BrokerOrderView | null> {
		return this._open.get(id) ?? this._inner.query(id);
	}

	async cancel(id: string): Promise<BrokerOrderView | null> {
		const resting = this._open.get(id);
		if (resting) {
			resting.status = "cancelled";
			return resting;
		}
		return this._inner.cancel(id);
	}

	async account(): Promise<BrokerAccount> {
		const account = await this._inner.account();
		const openOrders = [...this._open.values()]
			.filter((order) => order.status === "open")
			.map((order) => order.clientOrderId);
		return { ...account, openOrders };
	}

	haltedSymbols(): Promise<string[]> {
		return this._inner.haltedSymbols();
	}
}
