export interface BrokerOrderRequest {
	clientOrderId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	limitPrice?: number;
	/** The price the service read itself (`PricePort`), never the intent's. */
	referencePrice: number;
}

/** A market price and the market time it was observed at (epoch ms). */
export interface MarketPrice {
	price: number;
	at: number;
	/** Age past which a mark is stale: 2 bars of the model it was read for (`haltAgeMs` when absent). */
	maxAgeMs?: number;
}

/** The market prices the service reads itself (ADR-0064 §7): the only source of its marks. */
export interface PricePort {
	/** The latest price of each symbol, of the `barMs` bars when given (any bar otherwise); a symbol with no recent price is absent. */
	latest(
		symbols: readonly string[],
		barMs?: number
	): Promise<Record<string, MarketPrice>>;
}

/** What the broker says about an order: cumulative fills, never the requested quantity. */
export interface BrokerOrderView {
	clientOrderId: string;
	status: "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
	filledQty: number;
	quoteQty: number;
	fee: number;
}

export interface BrokerAccount {
	cash: number;
	positions: Record<string, number>;
	openOrders: string[];
}

/** The only door to an exchange: the simulated broker in this release (ADR-0064 §6). */
export interface BrokerPort {
	/** Idempotent by `clientOrderId`: a retry returns the existing order. */
	submit(order: BrokerOrderRequest): Promise<BrokerOrderView>;
	query(clientOrderId: string): Promise<BrokerOrderView | null>;
	cancel(clientOrderId: string): Promise<BrokerOrderView | null>;
	account(): Promise<BrokerAccount>;
	/** Instruments the exchange reports as not in trading status (ADR-0064 §7). */
	haltedSymbols(): Promise<string[]>;
}

/** Durable store of the service state; `load` throws when the stored state is unreadable. */
export interface StatePort<Doc> {
	load(): Promise<Doc | null>;
	save(state: Doc): Promise<void>;
}

/** ADR-0069: does the manifest of this model say `admission.admissible: true`; `barMs` is its bar length (`replay.intervalMs`), absent on older manifests. */
export interface AdmissionPort {
	admission(
		symbol: string,
		version: string
	): Promise<{ admissible: boolean; barMs?: number }>;
}
