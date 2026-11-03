import type { MarketDataSnapshot, SnapshotPart } from "../market-data-snapshot";

/** Publishes a snapshot to the subscribers (the message-manager bus). */
export interface MarketDataPublisherPort {
	/**
	 * Never rejects (a failed publish is logged): resolves with the parts that
	 * could not be published, empty when every part was.
	 */
	publish(snapshot: MarketDataSnapshot): Promise<SnapshotPart[]>;
}
