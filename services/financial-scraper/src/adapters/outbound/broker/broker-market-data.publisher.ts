import type { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	MarketDataSnapshot,
	SnapshotPart,
} from "../../../domain/market-data-snapshot";
import type { MarketDataPublisherPort } from "../../../domain/ports/market-data-publisher.port";
import {
	buildMarketDataEntries,
	sendAllMarketData,
} from "./market-data-sender";
import { createMarketDataMetadata } from "./metadata-builder";

/** Publishes each part of a snapshot as a market event through message-manager. */
export class BrokerMarketDataPublisher implements MarketDataPublisherPort {
	constructor(private readonly _deliveryMode?: DeliveryMode) {}

	publish(snapshot: MarketDataSnapshot): Promise<SnapshotPart[]> {
		// A fresh builder per snapshot: ids and deduplication id are per cycle.
		return sendAllMarketData(
			buildMarketDataEntries(snapshot),
			createMarketDataMetadata(this._deliveryMode)
		);
	}
}
